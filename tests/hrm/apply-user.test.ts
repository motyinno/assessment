import { describe, expect, it } from "vitest";
import { buildUserWrite } from "@/lib/hrm/apply-user";
import type { MappedEmployee } from "@/lib/hrm/mapping";

const NOW = new Date("2026-09-09T00:00:00.000Z");

function mapped(overrides: Partial<MappedEmployee> = {}): MappedEmployee {
  return {
    hrmEmployeeId: 1,
    email: "alex@example.com",
    name: "Alex Ivanov",
    jobTitle: "Engineer",
    grade: "mid",
    professionalLevel: null,
    managerialLevel: null,
    isMentor: false,
    isDeliveryCoordinator: false,
    managerChain: [],
    hrmManagerId: 99,
    isArchived: false,
    hrmDismissed: false,
    orgUnitIds: [1, 2],
    photoFileName: null,
    ...overrides,
  };
}

describe("buildUserWrite — creation (existing: null)", () => {
  it("grade from HRM lands in create", () => {
    const { create } = buildUserWrite(mapped({ grade: "sen" }), null, NOW);
    expect(create?.grade).toBe("sen");
  });

  it("a null HRM grade also lands (nothing local to protect)", () => {
    const { create } = buildUserWrite(mapped({ grade: null }), null, NOW);
    expect(create).toHaveProperty("grade", null);
  });

  it("includes email — it's the creation key", () => {
    const { create } = buildUserWrite(mapped({ email: "new@example.com" }), null, NOW);
    expect(create?.email).toBe("new@example.com");
  });

  it("does not include role at all", () => {
    const { create } = buildUserWrite(mapped(), null, NOW);
    expect(create).not.toHaveProperty("role");
  });

  it("does not include projects (not written in S03)", () => {
    const { create } = buildUserWrite(mapped(), null, NOW);
    expect(create).not.toHaveProperty("projects");
  });

  it("photoFileName from HRM lands in create", () => {
    const { create } = buildUserWrite(mapped({ photoFileName: "photos/a.jpeg" }), null, NOW);
    expect(create?.photoFileName).toBe("photos/a.jpeg");
  });

  it("does not include managerId (only the raw hrmManagerId)", () => {
    const { create } = buildUserWrite(mapped(), null, NOW);
    expect(create).not.toHaveProperty("managerId");
    expect(create?.hrmManagerId).toBe(99);
  });

  it("stamps hrmSyncedAt with the given `now`", () => {
    const { create } = buildUserWrite(mapped(), null, NOW);
    expect(create?.hrmSyncedAt).toBe(NOW);
  });

  it("returns no `update` key", () => {
    const write = buildUserWrite(mapped(), null, NOW);
    expect(write.update).toBeUndefined();
  });
});

describe("buildUserWrite — update (existing user)", () => {
  it("existing with a non-empty grade: `grade` is absent from update entirely", () => {
    const { update } = buildUserWrite(mapped({ grade: "mid" }), { grade: "sen" }, NOW);
    expect(update).not.toHaveProperty("grade");
  });

  it("existing with grade: null: HRM's grade lands in update", () => {
    const { update } = buildUserWrite(mapped({ grade: "mid" }), { grade: null }, NOW);
    expect(update?.grade).toBe("mid");
  });

  it("existing with grade: '' (empty string) is also treated as empty", () => {
    const { update } = buildUserWrite(mapped({ grade: "jun" }), { grade: "" }, NOW);
    expect(update?.grade).toBe("jun");
  });

  it("role never appears in update", () => {
    const { update } = buildUserWrite(mapped(), { grade: "sen" }, NOW);
    expect(update).not.toHaveProperty("role");
  });

  it("email never appears in update", () => {
    const { update } = buildUserWrite(mapped(), { grade: "sen" }, NOW);
    expect(update).not.toHaveProperty("email");
  });

  it("projects never appears in update (not written in S03)", () => {
    const { update } = buildUserWrite(mapped(), { grade: "sen" }, NOW);
    expect(update).not.toHaveProperty("projects");
  });

  it("photoFileName from HRM always lands in update, like jobTitle", () => {
    const { update } = buildUserWrite(mapped({ photoFileName: "photos/b.jpeg" }), { grade: "sen" }, NOW);
    expect(update?.photoFileName).toBe("photos/b.jpeg");
  });

  it("managerId never appears in update, only the raw hrmManagerId", () => {
    const { update } = buildUserWrite(mapped({ hrmManagerId: 7 }), { grade: "sen" }, NOW);
    expect(update).not.toHaveProperty("managerId");
    expect(update?.hrmManagerId).toBe(7);
  });

  it("lifecycleStatus flip to non-ACTUAL (mapped as isArchived/hrmDismissed) is always written", () => {
    const { update } = buildUserWrite(mapped({ isArchived: true, hrmDismissed: true }), { grade: "sen" }, NOW);
    expect(update?.isArchived).toBe(true);
    expect(update?.hrmDismissed).toBe(true);
  });

  it("a return to ACTUAL clears both flags", () => {
    const { update } = buildUserWrite(mapped({ isArchived: false, hrmDismissed: false }), { grade: "sen" }, NOW);
    expect(update?.isArchived).toBe(false);
    expect(update?.hrmDismissed).toBe(false);
  });

  it("name and jobTitle are always overwritten from HRM", () => {
    const { update } = buildUserWrite(mapped({ name: "New Name", jobTitle: "New Title" }), { grade: "sen" }, NOW);
    expect(update?.name).toBe("New Name");
    expect(update?.jobTitle).toBe("New Title");
  });

  it("returns no `create` key", () => {
    const write = buildUserWrite(mapped(), { grade: "sen" }, NOW);
    expect(write.create).toBeUndefined();
  });
});
