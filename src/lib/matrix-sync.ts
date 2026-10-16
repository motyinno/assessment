import { randomUUID } from "crypto";
import type { MatrixProposalKind, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";
import { loadTechMatrix } from "@/lib/data-loader";
import { uniqueSlug } from "@/lib/slug";
import { generateMatrixSyncProposals } from "@/lib/ai-service";
import { deltaPp, isLowConfidence } from "@/lib/market-report";
import { signalDemand, trendTag } from "@/lib/market-fit";
import type { TechMatrix } from "@/lib/types";

/**
 * Market sync: a reviewed market report drafts edits to its division's tech
 * matrix — new sections/topics/questions where clients ask for something the
 * matrix lacks, removals of clearly obsolete content, and Hot / Cooling tags
 * from the trend. Tags are computed here; the rest is drafted by the AI and
 * validated against the live matrix. Nothing changes until an admin accepts
 * proposals and publishes them, together, as a new TechMatrixVersion.
 */

export type Band = "jun" | "mid" | "sen";
const BANDS: Band[] = ["jun", "mid", "sen"];
const MAX_SKILLS_PER_BAND = 8;

export type BandSkills = Partial<Record<Band, string[]>>;
export interface ProposalPayload extends BandSkills {
  topics?: Array<{ title: string } & Record<Band, string[]>>;
}

export interface ProposalDraft {
  kind: MatrixProposalKind;
  sectionId: string | null;
  topicId: string | null;
  title: string | null;
  payload: ProposalPayload;
  rationale: string;
  signalIds: string[];
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

interface SignalForSync {
  id: string;
  label: string;
  kind: string;
  share: number | null;
  baseline: number | null;
  sampleN: number | null;
  mappingState: string;
  topicId: string | null;
  match: string | null;
  proposedTitle: string | null;
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 120) : "");

function skillList(raw: unknown, exclude: Set<string> = new Set()): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set(exclude);
  for (const r of raw) {
    const s = clean(r);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= MAX_SKILLS_PER_BAND) break;
  }
  return out;
}

/**
 * Hot / Cooling from MAPPED signals: the strongest signal on a topic decides,
 * Δ at or beyond ±10 pp. A topic already carrying the tag gets no proposal.
 */
export function tagProposals(signals: SignalForSync[], matrix: TechMatrix): ProposalDraft[] {
  const topics = new Map(matrix.sections.flatMap((s) => s.topics.map((t) => [t.id, t] as const)));
  const lead = new Map<string, SignalForSync>();
  for (const s of signals) {
    if (s.mappingState !== "MAPPED" || !s.topicId || !topics.has(s.topicId)) continue;
    const cur = lead.get(s.topicId);
    if (!cur || signalDemand(s) > signalDemand(cur)) lead.set(s.topicId, s);
  }
  const out: ProposalDraft[] = [];
  for (const [topicId, s] of lead) {
    const d = deltaPp(s);
    const tag = trendTag(d);
    const topic = topics.get(topicId)!;
    if (!tag || topic.trendTag === tag) continue;
    const share = s.share != null ? `${Math.round(s.share * 1000) / 10}%` : "—";
    out.push({
      kind: tag === "hot" ? "TAG_HOT" : "TAG_COOLING",
      sectionId: null,
      topicId,
      title: null,
      payload: {},
      rationale:
        tag === "hot"
          ? `${s.label}: ${share} of requests, +${d!.toFixed(1)} pp vs 12 months. Tagged Hot on the matrix and in the PDP picker.`
          : `${s.label}: ${share} of requests, ${d!.toFixed(1)} pp vs 12 months. Stays in the matrix, tagged Cooling; its falling demand already lowers it in PDP ranking.`,
      signalIds: [s.id],
    });
  }
  // Hot first, each group by size of the move.
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "TAG_HOT" ? -1 : 1));
}

/** Validate the AI's draft against the live matrix; drops anything that doesn't fit. */
export function normalizeAiProposals(raw: unknown, matrix: TechMatrix, signals: SignalForSync[]): ProposalDraft[] {
  const list = (raw as { proposals?: unknown })?.proposals;
  if (!Array.isArray(list)) return [];
  const sections = new Map(matrix.sections.map((s) => [s.id, s]));
  const topics = new Map(matrix.sections.flatMap((s) => s.topics.map((t) => [t.id, t] as const)));
  const sectionTitles = new Set(matrix.sections.map((s) => s.title.toLowerCase()));
  const topicTitles = new Set(matrix.sections.flatMap((s) => s.topics.map((t) => t.title.toLowerCase())));
  const byLabel = new Map(signals.map((s) => [s.label.toLowerCase(), s.id]));
  const removals = { count: 0 };

  const out: ProposalDraft[] = [];
  for (const item of list.slice(0, 15)) {
    const p = item as Record<string, unknown>;
    const rationale = typeof p.rationale === "string" ? p.rationale.trim().slice(0, 600) : "";
    const signalIds = Array.isArray(p.signals)
      ? [...new Set(p.signals.map((l) => byLabel.get(String(l).toLowerCase())).filter((x): x is string => !!x))]
      : [];
    const title = clean(p.title);
    const base = { rationale: rationale || "Suggested from the market report.", signalIds };

    switch (p.kind) {
      case "ADD_SECTION": {
        if (!title || sectionTitles.has(title.toLowerCase())) break;
        const newTopics = (Array.isArray(p.topics) ? p.topics : [])
          .slice(0, 4)
          .map((t) => {
            const r = t as Record<string, unknown>;
            return { title: clean(r.title), jun: skillList(r.jun), mid: skillList(r.mid), sen: skillList(r.sen) };
          })
          .filter((t) => t.title && !topicTitles.has(t.title.toLowerCase()) && (t.jun.length || t.mid.length || t.sen.length));
        if (!newTopics.length) break;
        const after = typeof p.afterSectionId === "string" && sections.has(p.afterSectionId) ? p.afterSectionId : null;
        out.push({ kind: "ADD_SECTION", sectionId: after, topicId: null, title, payload: { topics: newTopics }, ...base });
        sectionTitles.add(title.toLowerCase());
        newTopics.forEach((t) => topicTitles.add(t.title.toLowerCase()));
        break;
      }
      case "ADD_TOPIC": {
        const sectionId = typeof p.sectionId === "string" && sections.has(p.sectionId) ? p.sectionId : null;
        if (!sectionId || !title || topicTitles.has(title.toLowerCase())) break;
        const payload = { jun: skillList(p.jun), mid: skillList(p.mid), sen: skillList(p.sen) };
        if (!payload.jun.length && !payload.mid.length && !payload.sen.length) break;
        out.push({ kind: "ADD_TOPIC", sectionId, topicId: null, title, payload, ...base });
        topicTitles.add(title.toLowerCase());
        break;
      }
      case "ADD_QUESTIONS": {
        const topic = typeof p.topicId === "string" ? topics.get(p.topicId) : undefined;
        if (!topic) break;
        const payload: BandSkills = {};
        for (const b of BANDS) {
          const existing = new Set(topic[b].map((x) => x.toLowerCase()));
          const add = skillList(p[b], existing);
          if (add.length) payload[b] = add;
        }
        if (!Object.keys(payload).length) break;
        out.push({ kind: "ADD_QUESTIONS", sectionId: null, topicId: topic.id, title: null, payload, ...base });
        break;
      }
      case "REMOVE_QUESTIONS": {
        const topic = typeof p.topicId === "string" ? topics.get(p.topicId) : undefined;
        if (!topic || removals.count >= 3) break;
        const payload: BandSkills = {};
        for (const b of BANDS) {
          const wanted = Array.isArray(p[b]) ? new Set((p[b] as unknown[]).map((x) => String(x).trim().toLowerCase())) : new Set<string>();
          // Only exact existing strings — they're what progress is keyed on.
          const drop = topic[b].filter((x) => wanted.has(x.toLowerCase()));
          if (drop.length) payload[b] = drop;
        }
        if (!Object.keys(payload).length) break;
        out.push({ kind: "REMOVE_QUESTIONS", sectionId: null, topicId: topic.id, title: null, payload, ...base });
        removals.count++;
        break;
      }
      case "REMOVE_TOPIC": {
        const topic = typeof p.topicId === "string" ? topics.get(p.topicId) : undefined;
        if (!topic || removals.count >= 3) break;
        out.push({ kind: "REMOVE_TOPIC", sectionId: null, topicId: topic.id, title: null, payload: {}, ...base });
        removals.count++;
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Background generation
// ---------------------------------------------------------------------------

/** Start drafting proposals for a source; replaces its earlier unapplied ones when done. */
export async function startProposalGeneration(sourceId: string): Promise<void> {
  const generationId = randomUUID();
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { proposalsStatus: "GENERATING", proposalsError: null, proposalsGenerationId: generationId },
  });
  void runProposalGeneration(sourceId, generationId);
}

export async function runProposalGeneration(sourceId: string, generationId: string): Promise<void> {
  const current = { id: sourceId, proposalsGenerationId: generationId };
  try {
    const source = await prisma.signalSource.findUniqueOrThrow({
      where: { id: sourceId },
      include: { signals: { orderBy: { order: "asc" } }, department: { select: { name: true } } },
    });
    const matrix = await loadTechMatrix(source.departmentId);
    const topics = new Map(matrix.sections.flatMap((s) => s.topics.map((t) => [t.id, t] as const)));
    const meta = (source.meta ?? {}) as { portraits?: Array<{ name: string; signals: string[] }>; notes?: string[] };

    const ai = await generateMatrixSyncProposals({
      divisionName: source.department.name,
      matrix: matrix.sections.map((s) => ({
        id: s.id,
        title: s.title,
        topics: s.topics.map((t) => ({ id: t.id, title: t.title, jun: t.jun, mid: t.mid, sen: t.sen })),
      })),
      signals: source.signals
        .filter((s) => s.kind !== "constraint")
        .map((s) => ({
          label: s.label,
          kind: s.kind,
          share: s.share,
          deltaPp: deltaPp(s),
          sampleN: s.sampleN,
          lowConfidence: isLowConfidence(s),
          state: s.mappingState,
          topic: s.topicId ? topics.get(s.topicId)?.title ?? null : null,
          match: s.match,
          proposedTitle: s.proposedTitle,
        })),
      portraits: meta.portraits ?? [],
      notes: meta.notes ?? [],
    });

    const drafts = [...normalizeAiProposals(ai, matrix, source.signals), ...tagProposals(source.signals, matrix)];

    await prisma.$transaction(async (tx) => {
      const still = await tx.signalSource.count({ where: current });
      if (!still) return;
      await tx.matrixProposal.deleteMany({ where: { sourceId, state: { in: ["PENDING", "ACCEPTED", "REJECTED"] } } });
      await tx.matrixProposal.createMany({
        data: drafts.map((d, i) => ({
          sourceId,
          departmentId: source.departmentId,
          kind: d.kind,
          order: i,
          sectionId: d.sectionId,
          topicId: d.topicId,
          title: d.title,
          payload: d.payload as Prisma.InputJsonValue,
          rationale: d.rationale,
          signalIds: d.signalIds,
        })),
      });
      await tx.signalSource.updateMany({ where: current, data: { proposalsStatus: "READY", proposalsError: null } });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("Matrix proposal generation failed", { sourceId, error: message });
    await prisma.signalSource
      .updateMany({ where: current, data: { proposalsStatus: "FAILED", proposalsError: message } })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Proposals of one source with what the UI needs to judge them. */
export async function listProposals(sourceId: string) {
  const source = await prisma.signalSource.findUniqueOrThrow({
    where: { id: sourceId },
    select: { id: true, title: true, departmentId: true, status: true, proposalsStatus: true, proposalsError: true },
  });
  const [rows, matrix, signals] = await Promise.all([
    prisma.matrixProposal.findMany({ where: { sourceId }, orderBy: { order: "asc" } }),
    loadTechMatrix(source.departmentId),
    prisma.signal.findMany({
      where: { sourceId },
      orderBy: { order: "asc" },
      select: { id: true, label: true, kind: true, share: true, baseline: true, sampleN: true, evidence: true, mappingState: true, rationale: true },
    }),
  ]);
  const sections = new Map(matrix.sections.map((s) => [s.id, s]));
  const topicSection = new Map(matrix.sections.flatMap((s) => s.topics.map((t) => [t.id, { topic: t, section: s }] as const)));
  const signalById = new Map(signals.map((s) => [s.id, s]));

  // How many people would lose progress if a topic went.
  const removeIds = rows.filter((r) => r.kind === "REMOVE_TOPIC" && r.topicId).map((r) => r.topicId as string);
  const progress = removeIds.length
    ? await prisma.roadmapProgress.groupBy({ by: ["topicId"], where: { topicId: { in: removeIds } }, _count: { userId: true } })
    : [];
  const affected = new Map(progress.map((p) => [p.topicId, p._count.userId]));

  return {
    source,
    proposals: rows.map((r) => {
      const ts = r.topicId ? topicSection.get(r.topicId) : undefined;
      return {
        id: r.id,
        kind: r.kind,
        state: r.state,
        title: r.title,
        payload: r.payload as ProposalPayload,
        rationale: r.rationale,
        section: r.sectionId ? (sections.get(r.sectionId) ? { id: r.sectionId, title: sections.get(r.sectionId)!.title } : null) : null,
        topic: ts ? { id: ts.topic.id, title: ts.topic.title, sectionTitle: ts.section.title, jun: ts.topic.jun, mid: ts.topic.mid, sen: ts.topic.sen } : null,
        targetMissing: (!!r.topicId && !ts) || (r.kind === "ADD_TOPIC" && !!r.sectionId && !sections.has(r.sectionId)),
        affectedPeople: r.topicId ? affected.get(r.topicId) ?? 0 : 0,
        signals: r.signalIds.flatMap((id) => {
          const s = signalById.get(id);
          return s ? [{ id: s.id, label: s.label, share: s.share, deltaPp: deltaPp(s), lowConfidence: isLowConfidence(s) }] : [];
        }),
        evidence: [
          ...new Set(
            r.signalIds.flatMap((id) => {
              const ev = signalById.get(id)?.evidence;
              return Array.isArray(ev) ? ev.flatMap((e) => (typeof (e as { requestId?: unknown })?.requestId === "string" ? [(e as { requestId: string }).requestId] : [])) : [];
            })
          ),
        ],
      };
    }),
    // What the report asked for that no proposal acts on, and why.
    notProposed: (() => {
      const used = new Set(rows.flatMap((r) => r.signalIds));
      return signals
        .filter((s) => !used.has(s.id) && (s.mappingState === "OUT_OF_SCOPE" || (s.mappingState === "PROPOSAL" && isLowConfidence(s))))
        .map((s) => ({
          id: s.id,
          label: s.label,
          share: s.share,
          deltaPp: deltaPp(s),
          reason:
            s.kind === "constraint"
              ? "hiring condition, kept for staffing reports"
              : s.mappingState === "OUT_OF_SCOPE"
                ? s.rationale ?? "outside this division's matrix"
                : `low confidence — ${s.sampleN} request${s.sampleN === 1 ? "" : "s"}`,
        }));
    })(),
  };
}

export type ProposalsDTO = Awaited<ReturnType<typeof listProposals>>;

/**
 * Demand per topic from the division's published report — the badges on the
 * matrix screens. The strongest mapped signal on a topic wins.
 */
export async function topicDemand(departmentId: string) {
  const source = await prisma.signalSource.findFirst({
    where: { departmentId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include: { signals: { where: { mappingState: "MAPPED", topicId: { not: null } } } },
  });
  if (!source) return { source: null, topics: {} as Record<string, { label: string; share: number | null; deltaPp: number | null }> };
  const best = new Map<string, (typeof source.signals)[number]>();
  for (const s of source.signals) {
    const cur = best.get(s.topicId!);
    if (!cur || signalDemand(s) > signalDemand(cur)) best.set(s.topicId!, s);
  }
  return {
    source: { id: source.id, title: source.title },
    topics: Object.fromEntries([...best].map(([topicId, s]) => [topicId, { label: s.label, share: s.share, deltaPp: deltaPp(s) }])),
  };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export interface ApplyResult {
  versionId: string;
  number: number;
  applied: number;
  skipped: number;
}

/**
 * Apply every ACCEPTED proposal of a source in one transaction and record the
 * matrix before/after as a new version. A proposal whose target is gone (the
 * topic was deleted meanwhile) is marked SKIPPED rather than failing the rest.
 */
export async function applyAcceptedProposals(sourceId: string, actorId: string): Promise<ApplyResult | null> {
  const source = await prisma.signalSource.findUniqueOrThrow({ where: { id: sourceId }, select: { departmentId: true } });
  const departmentId = source.departmentId;
  const accepted = await prisma.matrixProposal.findMany({ where: { sourceId, state: "ACCEPTED" }, orderBy: { order: "asc" } });
  if (!accepted.length) return null;
  const before = await loadTechMatrix(departmentId);

  return prisma.$transaction(async (tx) => {
    const taken = new Set([
      ...(await tx.matrixSection.findMany({ select: { id: true } })).map((s) => s.id),
      ...(await tx.matrixTopic.findMany({ select: { id: true } })).map((t) => t.id),
    ]);
    const applied: string[] = [];
    const skipped: string[] = [];
    const summary: Array<{ kind: string; title: string }> = [];

    const sectionOf = async (id: string) => tx.matrixSection.findFirst({ where: { id, departmentId }, include: { topics: { select: { id: true } } } });
    const topicOf = async (id: string) => tx.matrixTopic.findFirst({ where: { id, section: { departmentId } } });

    for (const p of accepted) {
      const payload = (p.payload ?? {}) as ProposalPayload;
      let ok = true;
      let label = p.title ?? "";
      switch (p.kind) {
        case "ADD_SECTION": {
          const sections = await tx.matrixSection.findMany({ where: { departmentId }, orderBy: { order: "asc" }, select: { id: true } });
          const afterIdx = p.sectionId ? sections.findIndex((s) => s.id === p.sectionId) : -1;
          const order = afterIdx >= 0 ? afterIdx + 1 : sections.length;
          // Shift later sections down to make room.
          for (const [i, s] of sections.entries()) if (i >= order) await tx.matrixSection.update({ where: { id: s.id }, data: { order: i + 1 } });
          const id = uniqueSlug(p.title ?? "section", taken);
          taken.add(id);
          await tx.matrixSection.create({ data: { id, departmentId, title: p.title ?? "New section", order } });
          for (const [i, t] of (payload.topics ?? []).entries()) {
            const tid = uniqueSlug(t.title, taken);
            taken.add(tid);
            await tx.matrixTopic.create({ data: { id: tid, sectionId: id, title: t.title, order: i, jun: t.jun ?? [], mid: t.mid ?? [], sen: t.sen ?? [] } });
          }
          break;
        }
        case "ADD_TOPIC": {
          const section = p.sectionId ? await sectionOf(p.sectionId) : null;
          if (!section) { ok = false; break; }
          const id = uniqueSlug(p.title ?? "topic", taken);
          taken.add(id);
          await tx.matrixTopic.create({
            data: { id, sectionId: section.id, title: p.title ?? "New topic", order: section.topics.length, jun: payload.jun ?? [], mid: payload.mid ?? [], sen: payload.sen ?? [] },
          });
          break;
        }
        case "ADD_QUESTIONS":
        case "REMOVE_QUESTIONS": {
          const topic = p.topicId ? await topicOf(p.topicId) : null;
          if (!topic) { ok = false; break; }
          label = topic.title;
          const data: Partial<Record<Band, string[]>> = {};
          for (const b of BANDS) {
            const list = payload[b] ?? [];
            if (!list.length) continue;
            if (p.kind === "ADD_QUESTIONS") {
              const have = new Set(topic[b].map((x) => x.toLowerCase()));
              data[b] = [...topic[b], ...list.filter((x) => !have.has(x.toLowerCase()))];
            } else {
              const drop = new Set(list);
              data[b] = topic[b].filter((x) => !drop.has(x));
            }
          }
          await tx.matrixTopic.update({ where: { id: topic.id }, data });
          break;
        }
        case "REMOVE_TOPIC": {
          const topic = p.topicId ? await topicOf(p.topicId) : null;
          if (!topic) { ok = false; break; }
          label = topic.title;
          // Same as the editor's delete: progress rows are orphaned, not deleted.
          await tx.matrixTopic.delete({ where: { id: topic.id } });
          break;
        }
        case "TAG_HOT":
        case "TAG_COOLING": {
          const topic = p.topicId ? await topicOf(p.topicId) : null;
          if (!topic) { ok = false; break; }
          label = topic.title;
          await tx.matrixTopic.update({ where: { id: topic.id }, data: { trendTag: p.kind === "TAG_HOT" ? "hot" : "cooling" } });
          break;
        }
      }
      (ok ? applied : skipped).push(p.id);
      if (ok) summary.push({ kind: p.kind, title: label });
    }

    const last = await tx.techMatrixVersion.findFirst({ where: { departmentId }, orderBy: { number: "desc" }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;
    const afterSections = await tx.matrixSection.findMany({
      where: { departmentId },
      orderBy: { order: "asc" },
      include: { topics: { orderBy: { order: "asc" } } },
    });
    const after: TechMatrix = {
      sections: afterSections.map((s) => ({
        id: s.id,
        title: s.title,
        topics: s.topics.map((t) => ({ id: t.id, title: t.title, jun: t.jun, mid: t.mid, sen: t.sen, trendTag: t.trendTag })),
      })),
    };
    const version = await tx.techMatrixVersion.create({
      data: {
        departmentId,
        number,
        sourceId,
        before: before as unknown as Prisma.InputJsonValue,
        after: after as unknown as Prisma.InputJsonValue,
        summary: summary as unknown as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
    if (applied.length) await tx.matrixProposal.updateMany({ where: { id: { in: applied } }, data: { state: "APPLIED", versionId: version.id } });
    if (skipped.length) await tx.matrixProposal.updateMany({ where: { id: { in: skipped } }, data: { state: "SKIPPED" } });
    return { versionId: version.id, number, applied: applied.length, skipped: skipped.length };
  }, { timeout: 30_000 });
}
