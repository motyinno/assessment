export const ROLES = ["USER", "ASSESSOR", "MANAGER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: Role[] = ["ASSESSOR", "MANAGER", "ADMIN"];
export const MANAGER_ROLES: Role[] = ["MANAGER", "ADMIN"];

export function isStaff(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export function canManagePeople(role: string | null | undefined): boolean {
  return !!role && (MANAGER_ROLES as readonly string[]).includes(role);
}

// Super admin is a flag layered on top of ADMIN (not a `role` enum value):
// HRM sync's role-rank logic and every `role === "ADMIN"` check across the
// app would otherwise need updating for a new enum member. Gates HRM Sync +
// Departments only; granted by hand (see scripts/grant-super-admin.ts).
export function isSuperAdmin(
  user: { role?: string | null; isSuperAdmin?: boolean | null } | null | undefined
): boolean {
  return !!user && user.role === "ADMIN" && !!user.isSuperAdmin;
}
