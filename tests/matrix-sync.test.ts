import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { normalizeAiProposals, tagProposals } from "@/lib/matrix-sync";
import type { TechMatrix } from "@/lib/types";

const matrix: TechMatrix = {
  sections: [
    {
      id: "backend",
      title: "Backend",
      topics: [
        { id: "node", title: "Node.js Core", jun: ["Event Loop"], mid: ["Streams"], sen: [] },
        { id: "grunt", title: "Grunt", jun: ["Gruntfile"], mid: [], sen: [] },
      ],
    },
    { id: "db", title: "Databases", topics: [{ id: "pg", title: "PostgreSQL", jun: ["Types"], mid: [], sen: [], trendTag: "cooling" }] },
  ],
};

const sig = (id: string, label: string, topicId: string | null, share: number, baseline: number | null, state = "MAPPED") => ({
  id,
  label,
  kind: "skill",
  share,
  baseline,
  sampleN: 10,
  mappingState: state,
  topicId,
  match: "exact",
  proposedTitle: null,
});

describe("tagProposals", () => {
  it("tags hot and cooling topics, skipping ones already tagged", () => {
    const out = tagProposals(
      [sig("s1", "Node.js", "node", 0.7, 0.5), sig("s2", "PostgreSQL", "pg", 0.2, 0.31), sig("s3", "Kafka", null, 0.3, 0.1, "PROPOSAL")],
      matrix
    );
    expect(out.map((p) => [p.kind, p.topicId])).toEqual([["TAG_HOT", "node"]]);
    expect(out[0].signalIds).toEqual(["s1"]);
  });
});

describe("normalizeAiProposals", () => {
  const signals = [sig("k", "Kafka", null, 0.18, 0.11, "PROPOSAL"), sig("n", "Node.js", "node", 0.5, 0.5)];

  it("keeps valid additions and drops duplicates, unknown targets and existing skills", () => {
    const out = normalizeAiProposals(
      {
        proposals: [
          { kind: "ADD_TOPIC", sectionId: "backend", title: "Message brokers", jun: ["Queues vs topics"], mid: ["Kafka consumer groups"], sen: [], rationale: "18%", signals: ["kafka"] },
          { kind: "ADD_TOPIC", sectionId: "backend", title: "node.js core", jun: ["x"] },
          { kind: "ADD_TOPIC", sectionId: "nope", title: "Ghost", jun: ["x"] },
          { kind: "ADD_QUESTIONS", topicId: "node", jun: ["event loop", "Worker threads"], mid: [] },
          { kind: "ADD_SECTION", title: "AI Engineering", afterSectionId: "backend", topics: [{ title: "Building LLM features", jun: ["LLM API basics"], mid: [], sen: [] }, { title: "Empty", jun: [] }] },
        ],
      },
      matrix,
      signals
    );
    expect(out.map((p) => p.kind)).toEqual(["ADD_TOPIC", "ADD_QUESTIONS", "ADD_SECTION"]);
    expect(out[0]).toMatchObject({ title: "Message brokers", signalIds: ["k"] });
    expect(out[1].payload).toEqual({ jun: ["Worker threads"] });
    expect(out[2]).toMatchObject({ sectionId: "backend", payload: { topics: [{ title: "Building LLM features" }] } });
  });

  it("only removes exact existing skills and caps removals at three", () => {
    const out = normalizeAiProposals(
      {
        proposals: [
          { kind: "REMOVE_QUESTIONS", topicId: "node", jun: ["event loop", "Made up"] },
          { kind: "REMOVE_TOPIC", topicId: "grunt" },
          { kind: "REMOVE_TOPIC", topicId: "pg" },
          { kind: "REMOVE_TOPIC", topicId: "node" },
          { kind: "REMOVE_TOPIC", topicId: "missing" },
        ],
      },
      matrix,
      signals
    );
    expect(out.map((p) => [p.kind, p.topicId])).toEqual([
      ["REMOVE_QUESTIONS", "node"],
      ["REMOVE_TOPIC", "grunt"],
      ["REMOVE_TOPIC", "pg"],
    ]);
    expect(out[0].payload).toEqual({ jun: ["Event Loop"] });
  });

  it("returns nothing for a malformed answer", () => {
    expect(normalizeAiProposals({ nope: 1 }, matrix, signals)).toEqual([]);
    expect(normalizeAiProposals(null, matrix, signals)).toEqual([]);
  });
});
