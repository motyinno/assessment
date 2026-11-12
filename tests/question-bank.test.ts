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

  it("sends questions without a valid topic, or without a kind, to the AI", () => {
    const { rows, unknownTopics } = prepareImport(
      [
        { text: "How do Stripe webhooks work?", kind: "THEORY", topicId: "payments", timesAsked: 1 },
        { text: "Have you used Angular signals?", kind: "EXPERIENCE", proposedTopic: "Angular", timesAsked: 1 },
        { text: "What is backpressure?", timesAsked: 1 },
        { text: "Tell us about a conflict in your team.", kind: "BEHAVIORAL", timesAsked: 1 },
        { text: "How do you write a unit test?", kind: "THEORY", topicId: "testing", timesAsked: 1 },
      ],
      topics
    );
    expect(unknownTopics).toBe(1);
    expect(rows.map((r) => [r.topicId, r.proposedTopic, r.pendingTopic, r.pendingKind])).toEqual([
      [null, null, true, false],
      [null, "Angular", true, false],
      [null, null, true, true],
      [null, null, false, false],
      ["testing", null, false, false],
    ]);
  });
});

describe("questionImportSchema", () => {
  it("accepts a question with only text", () => {
    expect(questionImportSchema.safeParse({ schema: "interview-questions/v1", questions: [{ text: "What is CORS?" }] }).success).toBe(true);
  });

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

describe("prepareImport skills", () => {
  it("keeps a skill the topic has and turns an unknown one into a proposal", () => {
    const skills = new Map([["nodejs-core", new Set(["Streams", "Event Loop"])]]);
    const { rows } = prepareImport(
      [
        { text: "What is backpressure in streams?", kind: "THEORY", topicId: "nodejs-core", skill: "Streams", timesAsked: 1 },
        { text: "How do you size a worker pool?", kind: "THEORY", topicId: "nodejs-core", skill: "Worker pools", timesAsked: 1 },
        { text: "What is drain?", kind: "THEORY", topicId: "nodejs-core", proposedSkill: "Backpressure handling", timesAsked: 1 },
      ],
      new Set(skills.keys()),
      skills
    );
    expect(rows.map((r) => [r.skill, r.proposedSkill])).toEqual([
      ["Streams", null],
      [null, "Worker pools"],
      [null, "Backpressure handling"],
    ]);
  });
});
