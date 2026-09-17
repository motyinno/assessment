import { describe, expect, it } from "vitest";
import { rollUpDistinct } from "@/lib/departments";

// Root-first "/"-joined id chains, exactly as rebuildDepartmentPaths writes them.
const NODES = [
  { id: "phpgo", path: "root/phpgo" },
  { id: "php", path: "root/phpgo/php" },
  { id: "go", path: "root/phpgo/go" },
  { id: "root", path: "root" },
];

describe("rollUpDistinct", () => {
  it("counts a person in a unit AND its sub-unit once", () => {
    // The live case this exists for: "PHP, GO" showed 13 in unit and 168
    // including sub-units over children of 62 and 93 — but the 13 direct
    // members are also in PHP or GO, so the subtree holds 155 people.
    const php = new Set(Array.from({ length: 93 }, (_, i) => `php-${i}`));
    const go = new Set(Array.from({ length: 62 }, (_, i) => `go-${i}`));
    // The 13 "direct" members of PHP, GO are the first 13 people of PHP.
    const phpgo = new Set(Array.from({ length: 13 }, (_, i) => `php-${i}`));

    const counts = rollUpDistinct(NODES, new Map([["php", php], ["go", go], ["phpgo", phpgo]]));

    expect(counts.get("php")).toBe(93);
    expect(counts.get("go")).toBe(62);
    expect(counts.get("phpgo")).toBe(155); // not 13 + 62 + 93 = 168
    expect(counts.get("root")).toBe(155);
  });

  it("still sums people who genuinely sit in only one sub-unit", () => {
    const counts = rollUpDistinct(
      NODES,
      new Map([["php", new Set(["a", "b"])], ["go", new Set(["c"])]])
    );
    expect(counts.get("phpgo")).toBe(3);
  });

  it("counts one person in two sibling sub-units once at the parent", () => {
    const counts = rollUpDistinct(
      NODES,
      new Map([["php", new Set(["shared"])], ["go", new Set(["shared"])]])
    );
    expect(counts.get("php")).toBe(1);
    expect(counts.get("go")).toBe(1);
    expect(counts.get("phpgo")).toBe(1);
  });

  it("gives every node an entry, zero included", () => {
    const counts = rollUpDistinct(NODES, new Map());
    expect([...counts.values()]).toEqual([0, 0, 0, 0]);
  });

  it("ignores sets for departments outside the node list", () => {
    const counts = rollUpDistinct(NODES, new Map([["elsewhere", new Set(["x"])]]));
    expect(counts.get("root")).toBe(0);
  });
});
