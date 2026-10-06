import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { aiTopicToGoal, planToDocRows, planSchema } from "@/lib/pdp-plan";
import { buildPdpDocx, PDP_DOC_DASH } from "@/lib/pdp-builder";

async function docText(buf: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(buf);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async("string");
    out[name] = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
  }
  return out;
}

describe("aiTopicToGoal", () => {
  it("puts questions first, then the practical task, skipping blanks", () => {
    expect(aiTopicToGoal({ category: "Kafka", questions: ["Q1", " ", "Q2"], practicalTask: "Do it" }, "kafka")).toEqual({
      title: "Kafka",
      matrixTopicId: "kafka",
      items: [
        { type: "THEORY", text: "Q1" },
        { type: "THEORY", text: "Q2" },
        { type: "PRACTICE", text: "Do it" },
      ],
    });
  });
});

describe("planToDocRows", () => {
  it("splits items into template questions and practical tasks", () => {
    const rows = planToDocRows([
      {
        title: "SQL",
        items: [
          { type: "PRACTICE", text: "Task A" },
          { type: "THEORY", text: "Q" },
          { type: "PRACTICE", text: "Task B" },
        ],
      } as never,
    ]);
    expect(rows).toEqual([{ category: "SQL", questions: ["Q"], practicalTasks: ["Task A", "Task B"] }]);
  });
});

describe("planSchema", () => {
  it("accepts client ids and rejects junk ids", () => {
    const goal = { title: "T", items: [{ type: "THEORY", text: "q" }] };
    expect(planSchema.safeParse({ goals: [{ ...goal, id: crypto.randomUUID() }] }).success).toBe(true);
    expect(planSchema.safeParse({ goals: [{ ...goal, id: "x'; drop" }] }).success).toBe(false);
    expect(planSchema.safeParse({ goals: [{ ...goal, items: [{ type: "THEORY", text: "  " }] }] }).success).toBe(false);
  });
});

describe("buildPdpDocx", () => {
  it("keeps the employee, manager and composer and dashes everyone else", async () => {
    const buf = await buildPdpDocx(
      {
        employee: "Anna Test",
        manager: "Boris Manager",
        composer: "Boris Manager",
        composedOn: new Date(2026, 9, 6),
        assessedOn: null,
      },
      [{ category: "Kafka", questions: ["Consumer groups?"], practicalTasks: ["A".repeat(400)] }]
    );
    const text = await docText(buf);
    const doc = text["word/document.xml"];
    expect(doc).toContain("Сотрудник: Anna Test");
    expect(doc).toContain("Непосредственный руководитель: Boris Manager");
    expect(doc).toContain("Карту составил: Boris Manager");
    expect(doc).toContain(`Карту проверил: ${PDP_DOC_DASH}`);
    expect(doc).toContain(`Карту утвердил: ${PDP_DOC_DASH}`);
    expect(doc).toContain(`Следующая оценка - ${PDP_DOC_DASH}`);
    expect(doc).not.toMatch(/Шатило|Вербовиков|1898|SURNAME/);
    // The manager's practical task is never truncated.
    expect(doc).toContain("A".repeat(400));
    expect(doc).toContain("Consumer groups?");

    const all = Object.values(text).join(" ");
    expect(all).toContain("Boris Manager 06.10.2026");
    expect(all).not.toMatch(/1898|SURNAME/);
  });

  it("dashes the manager when the employee has none", async () => {
    const text = await docText(await buildPdpDocx({ employee: "Solo" }, []));
    expect(text["word/document.xml"]).toContain(`Непосредственный руководитель: ${PDP_DOC_DASH}`);
  });
});
