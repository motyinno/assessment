import { describe, expect, it } from "vitest";
import {
  answeredOpen,
  gradeChoices,
  orderVerdicts,
  parseGeneratedQuestions,
  parseOpenVerdicts,
  publicQuestions,
  scoreOf,
  skillsToTick,
  type SelfCheckQuestion,
  type SelfCheckVerdict,
} from "@/lib/self-check";

const choice = (skill: string | null = null, correct = 1) => ({
  kind: "choice",
  text: "What happens?",
  options: ["a", "b", "c", "d"],
  correct,
  explanation: "because",
  skill,
});
const open = (skill: string | null = null) => ({ kind: "open", text: "Explain", keyPoints: ["x"], skill });

describe("parseGeneratedQuestions", () => {
  it("numbers questions, drops malformed ones and keeps only known skills, stored exactly", () => {
    const qs = parseGeneratedQuestions(
      {
        questions: [
          choice("  event LOOP phases "),
          choice("made-up skill"),
          { kind: "choice", text: "bad", options: ["a", "b", "c"], correct: 7 },
          { kind: "essay", text: "?" },
          open("Streams"),
        ],
      },
      ["Event loop phases", "Streams"]
    );
    expect(qs.map((q) => [q.id, q.kind, q.skill])).toEqual([
      ["q1", "choice", "Event loop phases"],
      ["q2", "choice", null],
      ["q3", "open", "Streams"],
    ]);
  });

  it("refuses an answer with too few usable questions", () => {
    expect(() => parseGeneratedQuestions({ questions: [choice(), open()] }, [])).toThrow();
    expect(() => parseGeneratedQuestions({}, [])).toThrow();
  });
});

describe("grading", () => {
  const questions = parseGeneratedQuestions(
    { questions: [choice("A", 1), choice("B", 2), open("C"), open("D")] },
    ["A", "B", "C", "D"]
  );

  it("never leaks the answer key before submit", () => {
    const pub = publicQuestions(questions);
    for (const q of pub) {
      expect(q).not.toHaveProperty("correct");
      expect(q).not.toHaveProperty("explanation");
      expect(q).not.toHaveProperty("keyPoints");
    }
  });

  it("grades choices, sends only non-blank open answers to the AI and scores partial as half", () => {
    const answers = [
      { questionId: "q1", choice: 1 },
      { questionId: "q2", choice: 0 },
      { questionId: "q3", text: "  a real answer " },
      { questionId: "q4", text: "   " },
    ];
    const choices = gradeChoices(questions, answers);
    expect(choices.map((v) => v.verdict)).toEqual(["correct", "wrong"]);
    const { toGrade, blank } = answeredOpen(questions, answers);
    expect(toGrade.map((g) => [g.question.id, g.answer])).toEqual([["q3", "a real answer"]]);
    expect(blank.map((v) => [v.questionId, v.verdict])).toEqual([["q4", "wrong"]]);

    const ai = parseOpenVerdicts({ verdicts: [{ questionId: "q3", verdict: "partial", feedback: "ok" }] }, ["q3"]);
    const all = orderVerdicts(questions, [...blank, ...ai, ...choices]);
    expect(all.map((v) => v.questionId)).toEqual(["q1", "q2", "q3", "q4"]);
    // 1 + 0 + 0.5 + 0 of 4
    expect(scoreOf(all)).toBe(38);
  });

  it("counts an answer the AI skipped as wrong", () => {
    expect(parseOpenVerdicts({ verdicts: [] }, ["q3"])[0].verdict).toBe("wrong");
    expect(parseOpenVerdicts("garbage", ["q3"])[0].verdict).toBe("wrong");
  });
});

describe("skillsToTick", () => {
  const questions: SelfCheckQuestion[] = parseGeneratedQuestions(
    { questions: [choice("A"), choice("B"), choice("A"), open(null)] },
    ["A", "B"]
  );
  const v = (verdicts: string[]): SelfCheckVerdict[] =>
    verdicts.map((verdict, i) => ({ questionId: `q${i + 1}`, verdict: verdict as SelfCheckVerdict["verdict"], feedback: "" }));

  it("offers the skills of right answers, once each, skipping ones already ticked", () => {
    expect(skillsToTick(questions, v(["correct", "correct", "correct", "partial"]), [])).toEqual(["A", "B"]);
    expect(skillsToTick(questions, v(["correct", "correct", "correct", "partial"]), ["A"])).toEqual(["B"]);
  });

  it("offers nothing for a check that didn't pass", () => {
    expect(skillsToTick(questions, v(["correct", "wrong", "wrong", "partial"]), [])).toEqual([]);
  });
});
