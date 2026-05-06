export const ROLES = ["USER", "ASSESSOR", "MANAGER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: Role[] = ["ASSESSOR", "MANAGER", "ADMIN"];
export const MANAGER_ROLES: Role[] = ["MANAGER", "ADMIN"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isStaff(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export function canManagePeople(role: string | null | undefined): boolean {
  return !!role && (MANAGER_ROLES as readonly string[]).includes(role);
}

export function roleLabel(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "MANAGER":
      return "Manager";
    case "ASSESSOR":
      return "Assessor";
    default:
      return "User";
  }
}
