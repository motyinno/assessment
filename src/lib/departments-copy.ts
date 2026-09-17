/**
 * Client-safe copy shared between department-tree.tsx and the unit card page
 * (src/lib/departments.ts pulls in `prisma` and can't be imported from "use
 * client" components).
 */

/**
 * The "membership counted more than once" caveat (S10 F2).
 *
 * Rewritten twice. It first warned that "the sum across the tree can exceed
 * total headcount", which described the old roll-up adding per-unit counts
 * together — the bug that made "PHP, GO" read 168 over children of 62 and 93.
 * Then the tree stopped showing two numbers at all (see department-tree.tsx),
 * leaving one thing worth saying: a person in several units is counted once
 * inside any unit that contains them all, but shows up in each of those units'
 * own figures — so sibling numbers don't add up to their parent's.
 */
export const MULTI_MEMBERSHIP_NOTE =
  "Each headcount covers the unit and everything under it, counting a person once. People often belong to several units, so sibling numbers don't add up to their parent's.";
