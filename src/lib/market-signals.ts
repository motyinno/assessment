import { randomUUID } from "crypto";
import type { Prisma, SignalMappingState } from "@prisma/client";
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";
import { loadTechMatrix } from "@/lib/data-loader";
import { listDivisions } from "@/lib/user-division";
import { extractMarketReport, mapSignalsToMatrix } from "@/lib/ai-service";
import { BANDS } from "@/lib/roadmap-types";
import { buildRoadmap } from "@/lib/roadmap";
import { DEFAULT_WEIGHTS, basisLabel, preselect, rankTopics, type FitWeights, type PdpBasis } from "@/lib/market-fit";
import type { TechMatrix } from "@/lib/types";
import {
  deltaPp,
  isLowConfidence,
  parseMarketReport,
  reportMeta,
  reportTitle,
  reportToSignals,
  validateMarketReport,
  type MarketReport,
  type SignalInput,
} from "@/lib/market-report";

/**
 * Market signals: a source (today a monthly client-requests report for one
 * division) becomes signals, each mapped onto the division's tech matrix. The
 * structured JSON contract imports without AI; an HTML export or pasted text
 * is extracted by the AI first. Mapping is rule-based where a label matches a
 * topic outright and AI otherwise. Everything stays IN_REVIEW until an admin
 * publishes it — only published sources feed PDP recommendations.
 */

export type SourceFormat = "json" | "html" | "text";

/** Cap on what's stored and sent to the AI — a report is a few pages. */
export const MAX_SOURCE_CHARS = 120_000;
const MAX_AI_TEXT_CHARS = 60_000;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Flatten an HTML export to text the AI can read: drops scripts/styles, keeps
 * table cells apart with " | " and rows/blocks on their own lines.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/section|\/article|\/header|\/table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Node.js" → "nodejs", "CI / CD" → "cicd". */
export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9а-яё+#]/gi, "");
}

/**
 * Labels that mean the same thing under different spellings. Keys and values
 * are normalized; a label resolves to its canonical form before matching.
 */
const SYNONYMS: Record<string, string> = {
  node: "nodejs",
  ts: "typescript",
  js: "javascript",
  postgres: "postgresql",
  psql: "postgresql",
  k8s: "kubernetes",
  reactjs: "react",
  vuejs: "vue",
  nestjs: "nest",
  continuousintegration: "cicd",
};

const canonical = (s: string) => {
  const n = normalizeLabel(s);
  return SYNONYMS[n] ?? n;
};

interface CandidateTopic {
  id: string;
  title: string;
  sectionTitle: string;
  skills: string[];
}

export function matrixCandidates(matrix: TechMatrix): CandidateTopic[] {
  return matrix.sections.flatMap((s) =>
    s.topics.map((t) => ({
      id: t.id,
      title: t.title,
      sectionTitle: s.title,
      skills: BANDS.flatMap((b) => t[b]),
    }))
  );
}

/**
 * Rule match: the label equals a topic title (or its id) once both are
 * normalized and synonyms resolved, or the title is the label plus a generic
 * suffix ("TypeScript Fundamentals", "Node.js Core").
 */
export function ruleMatch(label: string, topics: CandidateTopic[]): CandidateTopic | null {
  const key = canonical(label);
  if (!key) return null;
  const generic = /(fundamentals|basics|core|essentials|advanced)$/;
  for (const t of topics) {
    const title = canonical(t.title);
    if (title === key || canonical(t.id) === key) return t;
    const stripped = title.replace(generic, "");
    if (stripped && stripped !== title && (SYNONYMS[stripped] ?? stripped) === key) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Create + background processing
// ---------------------------------------------------------------------------

export type CreateSourceResult =
  | { ok: true; id: string }
  | { ok: false; error: string; issues?: string[] };

/**
 * Store a new source and start processing it in the background. A JSON
 * report is validated here, so contract errors come back to the uploader
 * right away instead of as a failed source.
 */
export async function createSource(opts: {
  departmentId: string;
  format: SourceFormat;
  rawText: string;
  title?: string | null;
  createdById: string;
}): Promise<CreateSourceResult> {
  const raw = opts.rawText.slice(0, MAX_SOURCE_CHARS);
  let report: MarketReport | null = null;
  if (opts.format === "json") {
    const parsed = parseMarketReport(raw);
    if (!parsed.ok) return parsed;
    report = parsed.report;
  }

  const generationId = randomUUID();
  const source = await prisma.signalSource.create({
    data: {
      departmentId: opts.departmentId,
      format: opts.format,
      rawText: raw,
      title: opts.title?.trim() || (report ? report.title?.trim() || reportTitle(report.period) : "Processing…"),
      status: "PROCESSING",
      generationId,
      createdById: opts.createdById,
      ...(report ? reportFields(report) : {}),
      ...(report ? { signals: { create: reportToSignals(report).map(signalRow) } } : {}),
    },
  });

  void runSourceProcessing({ sourceId: source.id, generationId, extract: !report });
  return { ok: true, id: source.id };
}

function reportFields(report: MarketReport) {
  return {
    periodFrom: new Date(`${report.period.from}T00:00:00Z`),
    periodTo: new Date(`${report.period.to}T00:00:00Z`),
    meta: reportMeta(report) as unknown as Prisma.InputJsonValue,
  };
}

function signalRow(s: SignalInput) {
  return {
    order: s.order,
    label: s.label,
    kind: s.kind,
    share: s.share,
    baseline: s.baseline,
    sampleN: s.sampleN,
    levelHint: s.levelHint,
    evidence: s.evidence as unknown as Prisma.InputJsonValue,
  };
}

/** Restart processing (re-extract for HTML/text, re-map for all). Returns the new run's token. */
export async function restartSourceProcessing(sourceId: string, opts: { extract: boolean }): Promise<string> {
  const generationId = randomUUID();
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { status: "PROCESSING", error: null, generationId },
  });
  void runSourceProcessing({ sourceId, generationId, extract: opts.extract });
  return generationId;
}

/**
 * Background job: (extract →) map → IN_REVIEW, or FAILED. Writes are guarded
 * by `generationId`, so a superseded run can't clobber a newer one. A mapping
 * failure keeps the extracted signals (unmapped) rather than failing the source.
 */
export async function runSourceProcessing(opts: { sourceId: string; generationId: string; extract: boolean }): Promise<void> {
  const { sourceId, generationId } = opts;
  const current = { id: sourceId, generationId };
  try {
    const source = await prisma.signalSource.findUnique({ where: { id: sourceId } });
    if (!source || source.generationId !== generationId) return;

    if (opts.extract) {
      const text = source.format === "html" ? htmlToText(source.rawText) : source.rawText;
      const parsed = validateMarketReport(await extractMarketReport(text.slice(0, MAX_AI_TEXT_CHARS)));
      if (!parsed.ok) {
        throw new Error(`The AI's reading didn't match the report contract: ${parsed.issues?.slice(0, 3).join("; ") ?? parsed.error}`);
      }
      const report = parsed.report;
      const written = await prisma.$transaction(async (tx) => {
        const res = await tx.signalSource.updateMany({
          where: current,
          data: { title: source.title === "Processing…" ? report.title?.trim() || reportTitle(report.period) : source.title, ...reportFields(report) },
        });
        if (res.count === 0) return false;
        await tx.signal.deleteMany({ where: { sourceId } });
        await tx.signal.createMany({ data: reportToSignals(report).map((s) => ({ ...signalRow(s), sourceId })) });
        return true;
      });
      if (!written) return;
    }

    let mappingError: string | null = null;
    try {
      await mapSourceSignals(sourceId, generationId);
    } catch (e) {
      mappingError = e instanceof Error ? e.message : String(e);
      log.error("Signal mapping failed", { sourceId, error: mappingError });
    }
    await prisma.signalSource.updateMany({
      where: current,
      data: { status: "IN_REVIEW", error: mappingError ? `Mapping incomplete: ${mappingError}` : null },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("Signal source processing failed", { sourceId, error: message });
    await prisma.signalSource
      .updateMany({ where: current, data: { status: "FAILED", error: message } })
      .catch(() => {});
  }
}

interface AiMapping {
  index: number;
  topicId: string | null;
  match: "exact" | "partial" | "none";
  inScope: boolean;
  proposedTitle: string | null;
  rationale: string | null;
}

function readAiMappings(raw: unknown, topicIds: Set<string>): Map<number, AiMapping> {
  const out = new Map<number, AiMapping>();
  const list = (raw as { mappings?: unknown })?.mappings;
  if (!Array.isArray(list)) return out;
  for (const m of list) {
    const r = m as Record<string, unknown>;
    if (typeof r?.index !== "number") continue;
    const topicId = typeof r.topicId === "string" && topicIds.has(r.topicId) ? r.topicId : null;
    const match = topicId ? (r.match === "exact" ? "exact" : "partial") : "none";
    out.set(r.index, {
      index: r.index,
      topicId,
      match,
      inScope: r.inScope !== false,
      proposedTitle: typeof r.proposedTitle === "string" && r.proposedTitle.trim() ? r.proposedTitle.trim().slice(0, 200) : null,
      rationale: typeof r.rationale === "string" ? r.rationale.trim().slice(0, 500) : null,
    });
  }
  return out;
}

/**
 * Map every signal not set by an admin: constraints are out of scope, label
 * matches are rule-mapped, the rest go to the AI in one call.
 */
export async function mapSourceSignals(sourceId: string, generationId?: string): Promise<void> {
  const source = await prisma.signalSource.findUniqueOrThrow({
    where: { id: sourceId },
    include: { signals: { orderBy: { order: "asc" } }, department: { select: { name: true } } },
  });
  const topics = matrixCandidates(await loadTechMatrix(source.departmentId));
  const topicIds = new Set(topics.map((t) => t.id));

  type Update = { id: string; data: Prisma.SignalUpdateInput };
  const updates: Update[] = [];
  const forAi: Array<{ index: number; id: string; label: string; kind: string }> = [];

  for (const s of source.signals) {
    if (s.mappedBy === "admin") continue;
    if (s.kind === "constraint") {
      updates.push({ id: s.id, data: mappingData("OUT_OF_SCOPE", null, null, "rule", "A hiring condition, not a skill", null) });
      continue;
    }
    const hit = ruleMatch(s.label, topics);
    if (hit) {
      updates.push({ id: s.id, data: mappingData("MAPPED", hit.id, "exact", "rule", `Label matches “${hit.title}”`, null) });
      continue;
    }
    forAi.push({ index: forAi.length, id: s.id, label: s.label, kind: s.kind });
  }

  if (forAi.length && topics.length) {
    const ai = readAiMappings(
      await mapSignalsToMatrix(
        forAi.map(({ index, label, kind }) => ({ index, label, kind })),
        topics.map((t) => ({ id: t.id, title: t.title, section: t.sectionTitle, skills: t.skills })),
        source.department.name
      ),
      topicIds
    );
    for (const s of forAi) {
      const m = ai.get(s.index);
      if (!m) continue;
      if (m.topicId) updates.push({ id: s.id, data: mappingData("MAPPED", m.topicId, m.match, "ai", m.rationale, null) });
      else if (m.inScope) updates.push({ id: s.id, data: mappingData("PROPOSAL", null, null, "ai", m.rationale, m.proposedTitle ?? s.label) });
      else updates.push({ id: s.id, data: mappingData("OUT_OF_SCOPE", null, null, "ai", m.rationale, null) });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (generationId) {
      const still = await tx.signalSource.count({ where: { id: sourceId, generationId } });
      if (!still) return;
    }
    for (const u of updates) await tx.signal.update({ where: { id: u.id }, data: u.data });
  });
}

function mappingData(
  state: SignalMappingState,
  topicId: string | null,
  match: string | null,
  mappedBy: string,
  rationale: string | null,
  proposedTitle: string | null
): Prisma.SignalUpdateInput {
  return { mappingState: state, topicId, match, mappedBy, rationale, proposedTitle };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

/**
 * Publish a reviewed source: it starts feeding PDP recommendations, and the
 * division's previously published report moves to the archive.
 */
export async function publishSource(sourceId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const source = await tx.signalSource.findUniqueOrThrow({ where: { id: sourceId } });
    await tx.signalSource.updateMany({
      where: { departmentId: source.departmentId, type: source.type, status: "PUBLISHED", id: { not: sourceId } },
      data: { status: "ARCHIVED" },
    });
    await tx.signalSource.update({ where: { id: sourceId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  });
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

type SourceRow = Prisma.SignalSourceGetPayload<{
  include: { createdBy: { select: { id: true; name: true } }; department: { select: { id: true; name: true } } };
}>;

export const sourceInclude = {
  createdBy: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} as const;

export function serializeSourceSummary(row: SourceRow, counts?: Partial<Record<SignalMappingState, number>>) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    format: row.format,
    status: row.status,
    error: row.error,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    meta: row.meta,
    division: row.department,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    counts: counts ?? null,
  };
}

export type SourceSummaryDTO = ReturnType<typeof serializeSourceSummary>;

export async function serializeSource(row: SourceRow) {
  const [signals, matrix] = await Promise.all([
    prisma.signal.findMany({ where: { sourceId: row.id }, orderBy: { order: "asc" } }),
    loadTechMatrix(row.departmentId),
  ]);
  const topics = new Map(matrixCandidates(matrix).map((t) => [t.id, t]));
  const counts: Partial<Record<SignalMappingState, number>> = {};
  for (const s of signals) counts[s.mappingState] = (counts[s.mappingState] ?? 0) + 1;

  return {
    ...serializeSourceSummary(row, counts),
    signals: signals.map((s) => {
      const topic = s.topicId ? topics.get(s.topicId) : undefined;
      return {
        id: s.id,
        label: s.label,
        kind: s.kind,
        share: s.share,
        baseline: s.baseline,
        deltaPp: deltaPp(s),
        sampleN: s.sampleN,
        lowConfidence: isLowConfidence(s),
        levelHint: s.levelHint,
        evidence: s.evidence,
        mappingState: s.mappingState,
        // A topic deleted from the matrix after mapping reads as unmapped.
        topic: topic ? { id: topic.id, title: topic.title, sectionTitle: topic.sectionTitle } : null,
        topicMissing: !!s.topicId && !topic,
        match: s.match,
        mappedBy: s.mappedBy,
        rationale: s.rationale,
        proposedTitle: s.proposedTitle,
      };
    }),
    topics: [...topics.values()].map((t) => ({ id: t.id, title: t.title, sectionTitle: t.sectionTitle })),
  };
}

export type SourceDTO = Awaited<ReturnType<typeof serializeSource>>;

export async function isDivision(departmentId: string): Promise<boolean> {
  return (await listDivisions()).some((d) => d.id === departmentId);
}

// ---------------------------------------------------------------------------
// PDP recommendations
// ---------------------------------------------------------------------------

/** Published (and archived) sources of a division — what a PDP can be based on. */
export async function listBasisSources(departmentId: string) {
  const rows = await prisma.signalSource.findMany({
    where: { departmentId, status: { in: ["PUBLISHED", "ARCHIVED"] } },
    orderBy: [{ status: "desc" }, { periodTo: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: { id: true, title: true, status: true, periodFrom: true, periodTo: true, meta: true, publishedAt: true },
  });
  return rows;
}

/**
 * Everything rankTopics needs for one employee: their division's matrix,
 * the MAPPED signals of the chosen sources (only that division's
 * published/archived ones count) and their roadmap progress at `band`.
 */
export async function loadRecommendationInputs(
  subjectId: string,
  sourceIds: string[],
  band: "jun" | "mid" | "sen"
) {
  const roadmap = await buildRoadmap(subjectId);
  const division = await prisma.user.findUnique({ where: { id: subjectId }, select: { divisionId: true } });

  const sources = division?.divisionId && sourceIds.length
    ? await prisma.signalSource.findMany({
        where: { id: { in: sourceIds }, departmentId: division.divisionId, status: { in: ["PUBLISHED", "ARCHIVED"] } },
        include: { signals: { where: { mappingState: "MAPPED", topicId: { not: null } } } },
      })
    : [];

  const topics = roadmap.sections.flatMap((s) =>
    s.topics.map((t) => ({ id: t.id, title: t.title, sectionTitle: s.title, skills: t.skills }))
  );
  const progress = new Map(
    roadmap.sections.flatMap((s) =>
      s.topics.map((t) => [t.id, { score: t.scores[band], resolved: t.resolvedSkills[band].length, total: t.skills[band].length }] as const)
    )
  );
  const usedAssessment = roadmap.sections.some((s) => s.topics.some((t) => BANDS.some((b) => t.scores[b] !== null)));
  const signals = sources.flatMap((src) =>
    src.signals.map((s) => ({
      id: s.id,
      sourceId: src.id,
      sourceTitle: src.title,
      label: s.label,
      topicId: s.topicId as string,
      share: s.share,
      baseline: s.baseline,
      sampleN: s.sampleN,
    }))
  );
  // Keep the caller's order so the basis label reads the way they picked.
  const sourceTitles = sourceIds.flatMap((id) => sources.filter((s) => s.id === id).map((s) => s.title));

  return {
    topics,
    signals,
    progress,
    usedAssessment,
    sources: sources.map((s) => ({ id: s.id, title: s.title })),
    sourceTitles,
    currentGrade: roadmap.currentGrade,
    nextGrade: roadmap.nextGrade,
  };
}

export interface BasisRequest {
  sourceIds?: string[];
  targetBand: "jun" | "mid" | "sen";
  horizonMonths?: number;
  maxTopics?: number;
  useGap?: boolean;
  weights?: Partial<FitWeights>;
}

/** Rank the matrix for one employee against the chosen sources. */
export async function rankForSubject(subjectId: string, input: BasisRequest) {
  const req = {
    sourceIds: input.sourceIds ?? [],
    targetBand: input.targetBand,
    horizonMonths: input.horizonMonths ?? 3,
    maxTopics: input.maxTopics ?? 5,
    useGap: input.useGap ?? true,
    weights: input.weights ?? {},
  };
  const inputs = await loadRecommendationInputs(subjectId, req.sourceIds, req.targetBand);
  const weights: FitWeights = { ...DEFAULT_WEIGHTS, ...req.weights };
  const ranked = rankTopics(inputs.topics, inputs.signals, inputs.progress, {
    targetBand: req.targetBand,
    useGap: req.useGap,
    weights,
  });
  const usedAssessment = req.useGap && inputs.usedAssessment;
  const basis: PdpBasis = {
    sourceIds: inputs.sources.map((s) => s.id),
    targetBand: req.targetBand,
    horizonMonths: req.horizonMonths,
    maxTopics: req.maxTopics,
    useGap: req.useGap,
    weights,
    label: basisLabel(inputs.sourceTitles, usedAssessment),
  };
  return { ranked, basis, usedAssessment, preselected: preselect(ranked, req.maxTopics) };
}
