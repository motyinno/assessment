import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/google-drive", () => ({ readDriveDocument: vi.fn() }));
vi.mock("@/lib/ai-service", () => ({ parsePdpDocument: vi.fn() }));

import { docxToText, htmlToText, parsedToPlan, PdpImportError } from "@/lib/pdp-doc-import";
import { buildPdpDocx } from "@/lib/pdp-builder";

describe("htmlToText", () => {
  it("keeps cells, rows and bullets from a Google Doc export", () => {
    const html = `<html><head><style>p{}</style></head><body>
      <p>Plan &amp; goals</p>
      <table><tr><td><p>Kafka</p></td><td><ul><li>What is a partition?</li><li>Consumer groups</li></ul></td><td><p>Build a consumer</p></td></tr></table>
    </body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Plan & goals");
    expect(text).toContain("Kafka");
    expect(text).toContain("- What is a partition?");
    expect(text).toContain("- Consumer groups");
    expect(text).toContain("Build a consumer");
    expect(text).not.toContain("<");
    expect(text).not.toContain("p{}");
  });
});

describe("docxToText", () => {
  it("reads back the topics, questions and tasks of a generated PDP", async () => {
    const buf = await buildPdpDocx({ employee: "Test Employee" }, [
      { category: "Kafka", questions: ["What is a partition?", "Consumer groups"], practicalTasks: ["Build a consumer"] },
      { category: "SQL", questions: ["Indexes"], practicalTasks: ["Tune a query"] },
    ]);
    const text = await docxToText(buf);
    for (const s of ["Kafka", "What is a partition?", "Consumer groups", "Build a consumer", "SQL", "Indexes", "Tune a query"]) {
      expect(text).toContain(s);
    }
    expect(text).not.toContain("<w:");
  });
});

describe("parsedToPlan", () => {
  it("maps questions to THEORY and tasks to PRACTICE, dropping empty topics", () => {
    expect(
      parsedToPlan([
        { title: "Kafka", questions: ["Q1"], practicalTasks: ["T1"] },
        { title: "Empty", questions: [], practicalTasks: [] },
      ])
    ).toEqual([
      {
        title: "Kafka",
        items: [
          { type: "THEORY", text: "Q1" },
          { type: "PRACTICE", text: "T1" },
        ],
      },
    ]);
  });

  it("rejects an oversized plan", () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ title: `T${i}`, questions: ["q"], practicalTasks: [] }));
    expect(() => parsedToPlan(many)).toThrow(PdpImportError);
  });
});
