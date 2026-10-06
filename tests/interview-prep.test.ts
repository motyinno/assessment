import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import {
  buildCandidateSections,
  defaultTopicSelection,
  normalizeAiPrep,
  parseAssignedSections,
  parsePdpTopics,
  prepTargetGrade,
  planPrepUpdate,
  orderTopics,
  effectivePrepStatus,
  PDP_SECTION_ID,
  PREP_STALE_MS,
  type PrepTopic,
} from "@/lib/interview-prep";
import type { TechMatrix } from "@/lib/types";

const matrix: TechMatrix = {
  sections: [
    {
      id: "backend",
      title: "Backend",
      topics: [
        { id: "spring", title: "Spring", jun: ["DI basics"], mid: ["Transactions", "Bean scopes"], sen: ["AOP internals"] },
        { id: "kafka", title: "Kafka", jun: [], mid: ["Consumer groups"], sen: [] },
      ],
    },
    {
      id: "db",
      title: "Databases",
      topics: [{ id: "sql", title: "SQL", jun: [], mid: ["Isolation levels"], sen: [] }],
    },
  ],
};

const build = (over: Partial<Parameters<typeof buildCandidateSections>[0]> = {}) =>
  buildCandidateSections({
    matrix,
    band: "mid",
    selfAssessments: [],
    pastResults: [],
    pdpTopics: [],
    ...over,
  });

describe("prepTargetGrade", () => {
  it("targets one step up, but keeps legacy imports' stored target", () => {
    expect(prepTargetGrade({ id: "abc", grade: "mid" })).toBe("mid+");
    expect(prepTargetGrade({ id: "legacy_1", grade: "mid" })).toBe("mid");
    expect(prepTargetGrade({ id: "abc", grade: "sen+" })).toBe("sen+");
  });
});

describe("parseAssignedSections", () => {
  it("accepts a JSON-encoded string or a native array", () => {
    expect(parseAssignedSections('["backend"]')).toEqual(["backend"]);
    expect(parseAssignedSections(["db"])).toEqual(["db"]);
    expect(parseAssignedSections(null)).toEqual([]);
    expect(parseAssignedSections("not json")).toEqual([]);
  });
});

describe("parsePdpTopics", () => {
  it("reads names, AI topic objects and the cached wrapper", () => {
    expect(parsePdpTopics(["Spring"])).toEqual([{ title: "Spring", questions: [] }]);
    expect(parsePdpTopics([{ category: "Kafka", questions: ["Rebalancing?"], practicalTask: "x" }])).toEqual([
      { title: "Kafka", questions: ["Rebalancing?"] },
    ]);
    expect(parsePdpTopics(JSON.stringify({ pdpTopics: [{ category: "SQL" }] }))).toEqual([
      { title: "SQL", questions: [] },
    ]);
    expect(parsePdpTopics({})).toEqual([]);
  });
});

describe("buildCandidateSections", () => {
  it("uses the target band's skills", () => {
    const spring = build()[0].topics[0];
    expect(spring.skills).toEqual(["Transactions", "Bean scopes"]);
  });

  it("joins the newest previous result by topic id or legacy title", () => {
    const sections = build({
      pastResults: [
        { category: "spring", score: 4, comment: "weak on tx", date: new Date("2026-05-01") },
        { category: "spring", score: 8, comment: null, date: new Date("2025-01-01") },
        { category: "SQL", score: 7, comment: null, date: new Date("2025-01-01") },
      ],
    });
    expect(sections[0].topics[0].signals).toMatchObject({ pastScore: 4, pastComment: "weak on tx" });
    expect(sections[1].topics[0].signals.pastScore).toBe(7);
    expect(sections[0].topics[1].signals.pastScore).toBeNull();
  });

  it("works with no self-assessment and attaches it when present", () => {
    expect(build()[0].topics[0].signals.selfScore).toBeNull();
    const withSelf = build({ selfAssessments: [{ topicId: "kafka", score: 9, comment: "" }] });
    expect(withSelf[0].topics[1].signals.selfScore).toBe(9);
  });

  it("marks PDP topics and groups the ones outside the matrix", () => {
    const sections = build({
      pdpTopics: [
        { title: "spring", questions: ["Proxies"] },
        { title: "Docker", questions: ["Layers"] },
      ],
    });
    expect(sections[0].topics[0].signals).toMatchObject({ inPdp: true, pdpQuestions: ["Proxies"] });
    const pdp = sections.find((s) => s.id === PDP_SECTION_ID)!;
    expect(pdp.topics).toHaveLength(1);
    expect(pdp.topics[0]).toMatchObject({ id: "pdp:0", title: "Docker", skills: ["Layers"] });
  });
});

describe("defaultTopicSelection", () => {
  const sections = build({
    pastResults: [{ category: "sql", score: 5, comment: null, date: new Date() }],
    pdpTopics: [{ title: "Kafka", questions: [] }],
  });

  it("picks the PDP topics for a PDP review", () => {
    expect(defaultTopicSelection(sections, { assessmentType: "PDP_CHECK", assignedSections: [] })).toEqual(["kafka"]);
  });

  it("picks the assessor's assigned sections", () => {
    expect(defaultTopicSelection(sections, { assessmentType: "GENERAL", assignedSections: ["backend"] })).toEqual([
      "spring",
      "kafka",
    ]);
  });

  it("otherwise picks previous gaps and PDP topics", () => {
    expect(defaultTopicSelection(sections, { assessmentType: "GENERAL", assignedSections: [] })).toEqual([
      "kafka",
      "sql",
    ]);
  });
});

describe("normalizeAiPrep", () => {
  const requested = build()[0].topics; // spring, kafka

  it("keeps known topics in picker order, drops invented ones and bad questions", () => {
    const content = normalizeAiPrep(
      {
        focus: " Dig into transactions ",
        topics: [
          { topicId: "kafka", questions: [{ text: "How do consumer groups rebalance?", level: "mid", reason: "coverage" }] },
          { topicId: "made-up", questions: [{ text: "?" }] },
          {
            topicId: "spring",
            questions: [
              { text: "Self-invocation and @Transactional?", level: "weird", reason: "past_gap", keyPoints: ["proxy", 3] },
              { nope: true },
            ],
          },
        ],
      },
      requested
    );
    expect(content.focus).toBe("Dig into transactions");
    expect(content.topics.map((t) => t.topicId)).toEqual(["spring", "kafka"]);
    const q = content.topics[0].questions[0];
    expect(content.topics[0].questions).toHaveLength(1);
    expect(q).toMatchObject({ level: "mid", reason: "past_gap", keyPoints: ["proxy"], asked: false, followUp: null });
    expect(q.id).toBeTruthy();
    expect(content.topics[0].title).toBe("Spring");
  });

  it("survives garbage", () => {
    expect(normalizeAiPrep(null, requested)).toEqual({ focus: "", topics: [] });
    expect(normalizeAiPrep({ topics: "nope" }, requested).topics).toEqual([]);
  });
});

const topic = (topicId: string, asked = false): PrepTopic => ({
  topicId,
  title: topicId,
  sectionTitle: "S",
  questions: [{ id: `${topicId}-q`, text: "?", level: "mid", reason: "coverage", keyPoints: [], redFlags: [], followUp: null, asked }],
  task: null,
});

describe("planPrepUpdate", () => {
  const existing = { language: "ru", content: { focus: "f", topics: [topic("a", true), topic("b")] } };

  it("keeps prepared topics (with their ticks), drops deselected, generates only new ones", () => {
    const plan = planPrepUpdate(existing, ["a", "c"], "ru");
    expect(plan.kept.map((t) => t.topicId)).toEqual(["a"]);
    expect(plan.kept[0].questions[0].asked).toBe(true);
    expect(plan.toGenerate).toEqual(["c"]);
  });

  it("needs no generation when topics are only removed", () => {
    expect(planPrepUpdate(existing, ["b"], "ru")).toMatchObject({ toGenerate: [] });
  });

  it("regenerates everything when the language changes or nothing exists yet", () => {
    expect(planPrepUpdate(existing, ["a", "c"], "en")).toEqual({ kept: [], toGenerate: ["a", "c"] });
    expect(planPrepUpdate(null, ["a"], "ru")).toEqual({ kept: [], toGenerate: ["a"] });
  });
});

describe("orderTopics", () => {
  it("follows the selection order", () => {
    expect(orderTopics([topic("c"), topic("a")], ["a", "b", "c"]).map((t) => t.topicId)).toEqual(["a", "c"]);
  });
});

describe("effectivePrepStatus", () => {
  it("treats a generation running past the stale limit as failed", () => {
    expect(effectivePrepStatus({ status: "GENERATING", generationStartedAt: new Date() })).toBe("GENERATING");
    expect(
      effectivePrepStatus({ status: "GENERATING", generationStartedAt: new Date(Date.now() - PREP_STALE_MS - 1000) })
    ).toBe("FAILED");
    expect(effectivePrepStatus({ status: "READY", generationStartedAt: null })).toBe("READY");
  });
});
