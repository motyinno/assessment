import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { deltaPp, parseMarketReport, ppLabel, reportTitle, reportToSignals } from "@/lib/market-report";
import { DEFAULT_WEIGHTS, gapOf, preselect, rankTopics, type FitSignal, type FitTopic } from "@/lib/market-fit";
import { htmlToText, ruleMatch } from "@/lib/market-signals";

const fixture = fs.readFileSync(path.join(__dirname, "fixtures/market-report-2026-09.json"), "utf-8");

describe("market report contract", () => {
  it("parses the September fixture into signals", () => {
    const parsed = parseMarketReport(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const signals = reportToSignals(parsed.report);
    expect(signals).toHaveLength(24);
    expect(signals[0]).toMatchObject({ label: "TypeScript", share: 0.689, baseline: 0.501, sampleN: 31 });
    expect(reportTitle(parsed.report.period)).toBe("Market Sep 2026");
  });

  it("fills share from n and n from share", () => {
    const parsed = parseMarketReport(
      JSON.stringify({
        schema: "market-report/v1",
        period: { from: "2026-09-01", to: "2026-09-30" },
        requests: 40,
        signals: [{ label: "Go", n: 10 }, { label: "Rust", share: 0.05 }, { label: "go", n: 3 }],
      })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const signals = reportToSignals(parsed.report);
    expect(signals.map((s) => [s.label, s.share, s.sampleN])).toEqual([
      ["Go", 0.25, 10],
      ["Rust", 0.05, 2],
    ]);
  });

  it("reports contract violations with paths", () => {
    const parsed = parseMarketReport(JSON.stringify({ schema: "market-report/v1", requests: 0, signals: [] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues?.some((i) => i.startsWith("period"))).toBe(true);
    expect(parsed.issues?.some((i) => i.startsWith("requests"))).toBe(true);
  });

  it("formats deltas", () => {
    expect(deltaPp({ share: 0.689, baseline: 0.501 })).toBe(18.8);
    expect(ppLabel(-7.2)).toBe("−7.2 pp");
    expect(ppLabel(null)).toBe("—");
  });
});

const band = (jun: string[]) => ({ jun, mid: ["m"], sen: ["s"] });
const topics: FitTopic[] = [
  { id: "ts", title: "TypeScript Fundamentals", sectionTitle: "TypeScript", skills: band(["TS vs JS"]) },
  { id: "node", title: "Node.js Core", sectionTitle: "Backend", skills: band(["Event Loop"]) },
  { id: "cloud", title: "Cloud & delivery", sectionTitle: "Backend", skills: band(["Docker basics"]) },
  { id: "llm", title: "Building LLM features", sectionTitle: "AI Engineering", skills: band(["LLM API basics"]) },
  { id: "assisted", title: "AI-assisted development", sectionTitle: "AI Engineering", skills: band(["Prompting"]) },
  { id: "fw", title: "Frameworks (Express/NestJS)", sectionTitle: "Backend", skills: band(["Routing"]) },
  { id: "db", title: "Databases", sectionTitle: "Databases", skills: band(["SQL"]) },
  { id: "testing", title: "Testing", sectionTitle: "Backend", skills: band(["Unit"]) },
  { id: "safety", title: "AI quality & safety", sectionTitle: "AI Engineering", skills: band([]) },
];
const sig = (id: string, topicId: string, share: number, baseline: number | null, n: number): FitSignal => ({
  id,
  sourceId: "src",
  sourceTitle: "Market Sep 2026",
  label: id,
  topicId,
  share,
  baseline,
  sampleN: n,
});
const signals = [
  sig("TypeScript", "ts", 0.689, 0.501, 31),
  sig("Node.js", "node", 0.511, 0.583, 23),
  sig("CI/CD", "cloud", 0.378, 0.333, 17),
  sig("B: Building AI systems", "llm", 0.311, 0.249, 14),
  sig("A: AI-assisted dev", "assisted", 0.222, null, 10),
  sig("REST", "fw", 0.222, 0.283, 10),
  sig("PostgreSQL", "db", 0.2, 0.309, 9),
  sig("Guardrails", "safety", 0.089, 0.015, 4),
];

describe("rankTopics", () => {
  const ranked = rankTopics(topics, signals, new Map(), { targetBand: "jun", useGap: true });
  const fit = Object.fromEntries(ranked.map((r) => [r.topicId, r.fit]));

  it("reproduces the worked example from the plan (no assessment → gap 1)", () => {
    expect(fit).toMatchObject({ ts: 0.77, node: 0.44, cloud: 0.4, llm: 0.33, assisted: 0.22, fw: 0.21, db: 0.18 });
    expect(ranked.slice(0, 5).map((r) => r.topicId)).toEqual(["ts", "node", "cloud", "llm", "assisted"]);
  });

  it("gives silent topics the baseline weight and hides topics without questions at the band", () => {
    const testing = ranked.find((r) => r.topicId === "testing")!;
    expect(testing).toMatchObject({ origin: "baseline", fit: DEFAULT_WEIGHTS.baselineWeight });
    const safety = ranked.find((r) => r.topicId === "safety")!;
    expect(safety).toMatchObject({ hidden: true, fit: 0 });
    expect(preselect(ranked, 10)).not.toContain("safety");
  });

  it("tags hot and cooling topics", () => {
    expect(ranked.find((r) => r.topicId === "ts")!.trendTag).toBe("hot");
    expect(ranked.find((r) => r.topicId === "db")!.trendTag).toBe("cooling");
    expect(ranked.find((r) => r.topicId === "node")!.trendTag).toBeNull();
  });

  it("halves low-confidence signals", () => {
    const shown = rankTopics(topics, signals, new Map(), { targetBand: "mid", useGap: false });
    const safety = shown.find((r) => r.topicId === "safety")!;
    expect(safety.signals[0].lowConfidence).toBe(true);
    expect(safety.demand).toBeCloseTo((0.6 * 0.089 + 0.4 * 0.015) * 0.5, 2);
  });

  it("weighs the assessment gap by the slider", () => {
    const progress = new Map([["ts", { score: 9, resolved: 0, total: 5 }]]);
    const full = rankTopics(topics, signals, progress, { targetBand: "jun", useGap: true, weights: { assessmentWeight: 1 } });
    const none = rankTopics(topics, signals, progress, { targetBand: "jun", useGap: true, weights: { assessmentWeight: 0 } });
    expect(full.find((r) => r.topicId === "ts")!.fit).toBe(0.08);
    expect(none.find((r) => r.topicId === "ts")!.fit).toBe(0.77);
  });

  it("takes the better of score and ticked questions as progress", () => {
    expect(gapOf(null)).toBe(1);
    expect(gapOf({ score: 4, resolved: 3, total: 5 })).toBeCloseTo(0.4);
    expect(gapOf({ score: null, resolved: 0, total: 0 })).toBe(1);
  });
});

describe("signal mapping helpers", () => {
  const candidates = topics.map((t) => ({ id: t.id, title: t.title, sectionTitle: t.sectionTitle, skills: [] }));

  it("rule-matches labels to topic titles through synonyms and generic suffixes", () => {
    expect(ruleMatch("TypeScript", candidates)?.id).toBe("ts");
    expect(ruleMatch("NodeJS", candidates)?.id).toBe("node");
    expect(ruleMatch("Node", candidates)?.id).toBe("node");
    expect(ruleMatch("Testing", candidates)?.id).toBe("testing");
    expect(ruleMatch("Kafka", candidates)).toBeNull();
  });

  it("flattens HTML tables and drops scripts", () => {
    const text = htmlToText(
      "<html><style>.a{}</style><script>alert(1)</script><h1>Report</h1><table><tr><th>Skill</th><th>Share</th></tr><tr><td>TypeScript</td><td>68.9%</td></tr></table></html>"
    );
    expect(text).toContain("Report");
    expect(text).toContain("TypeScript | 68.9% |");
    expect(text).not.toContain("alert");
  });
});
