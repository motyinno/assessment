/**
 * Client-safe copy shared between department-tree.tsx and the unit card page
 * (src/lib/departments.ts pulls in `prisma` and can't be imported from "use
 * client" components).
 */

/** The "membership counted more than once" caveat (S10 F2). */
export const MULTI_MEMBERSHIP_NOTE =
  "Сотрудники, состоящие в нескольких юнитах, учитываются в каждом — сумма по дереву может превышать штат компании.";
