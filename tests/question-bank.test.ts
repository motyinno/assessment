import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { normalizeQuestion, prepareImport, questionImportSchema } from "@/lib/question-bank";

describe("normalizeQuestion", () => {
  it("ignores case, punctuation and spacing, keeps Cyrillic", () => {
    expect(normalizeQuestion("What is the Event Loop?")).toBe(normalizeQuestion("what is the event-loop"));
    expect(normalizeQuestion("  Что такое   замыкание? ")).toBe("что такое замыкание");
  });
});

describe("prepareImport", () => {
  const topics = new Set(["nodejs-core", "testing"]);

  it("merges repeats, adds up counts and fills topic/band from later copies", () => {
    const { rows } = prepareImport(
      [
        { text: "What is the event loop?", kind: "THEORY", timesAsked: 2 },
        { text: "what is the EVENT LOOP", kind: "THEORY", topicId: "nodejs-core", band: "jun", timesAsked: 3 },
        { text: "How do you test NestJS apps?", kind: "THEORY", topicId: "testing", band: "mid", timesAsked: 1 },
      ],
      topics
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ text: "What is the event loop?", timesAsked: 5, topicId: "nodejs-core", band: "jun" });
  });

  it("keeps a question with an unknown topic unattached, proposing that topic", () => {
    const { rows, unknownTopics } = prepareImport(
      [
        { text: "How do Stripe webhooks work?", kind: "THEORY", topicId: "payments", timesAsked: 1 },
        { text: "Have you used Angular signals?", kind: "EXPERIENCE", proposedTopic: "Angular", timesAsked: 1 },
      ],
      topics
    );
    expect(unknownTopics).toBe(1);
    expect(rows.map((r) => [r.topicId, r.proposedTopic])).toEqual([
      [null, "payments"],
      [null, "Angular"],
    ]);
  });
});

describe("questionImportSchema", () => {
  it("rejects a wrong schema tag and bad kinds", () => {
    expect(questionImportSchema.safeParse({ schema: "x", questions: [] }).success).toBe(false);
    const r = questionImportSchema.safeParse({ schema: "interview-questions/v1", questions: [{ text: "Hello there", kind: "OTHER" }] });
    expect(r.success).toBe(false);
  });

  it("defaults timesAsked to 1", () => {
    const r = questionImportSchema.parse({ schema: "interview-questions/v1", questions: [{ text: "What is CORS?", kind: "THEORY" }] });
    expect(r.questions[0].timesAsked).toBe(1);
  });
});
