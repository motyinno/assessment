/**
 * Client-safe copy shared between department-tree.tsx and the unit card page
 * (src/lib/departments.ts pulls in `prisma` and can't be imported from "use
 * client" components).
 */

/** The "membership counted more than once" caveat (S10 F2). */
export const MULTI_MEMBERSHIP_NOTE =
  "Employees who belong to several units are counted in each one — the sum across the tree can exceed total headcount.";
