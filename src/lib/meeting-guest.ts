import prisma from "@/lib/prisma";
import { MAX_MEETING_GUESTS } from "@/lib/schemas";

/**
 * Everyone auto-invited as an optional guest to a person's assessment
 * meetings, taken from their org units.
 *
 * HRM files one person in ~2.6 units at once (see UserDepartment) and the
 * setting may sit on any of them, so "their department's guests" is genuinely
 * ambiguous. The rule: consider every unit the person belongs to, every
 * ancestor of those units, and their resolved Division — then take the list
 * from the DEEPEST unit that has one. The most specific setting wins whole;
 * lists are not merged up the tree, so a sub-unit that names two people gets
 * exactly those two rather than them plus the division's.
 *
 * A tie at the same depth (someone in two sibling units that both configure
 * guests) is broken by unit name, so the answer is stable across calls instead
 * of riding on row order.
 *
 * Returns an empty array when nothing is configured anywhere up the chain, and
 * that means nobody is invited — there is no org-wide default behind it.
 */
export async function resolveDepartmentMeetingGuests(
  userId: string
): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      divisionId: true,
      departments: { select: { department: { select: { path: true } } } },
    },
  });
  if (!user) return [];

  // `path` is the root-first "/"-joined id chain ending with the unit itself,
  // so splitting it yields the unit plus all of its ancestors in one go.
  const unitIds = new Set<string>();
  for (const m of user.departments) {
    for (const segment of m.department.path.split("/")) {
      if (segment) unitIds.add(segment);
    }
  }
  if (user.divisionId) unitIds.add(user.divisionId);
  if (unitIds.size === 0) return [];

  const candidates = await prisma.department.findMany({
    where: { id: { in: [...unitIds] }, isActive: true },
    select: { name: true, depth: true, meetingGuestEmails: true },
  });

  return pickMeetingGuests(candidates);
}

export interface MeetingGuestCandidate {
  name: string;
  depth: number;
  meetingGuestEmails: string[];
}

/**
 * Deepest unit with a non-empty list wins, ties broken by unit name. Split out
 * from the query above so the rule itself is testable without a database.
 */
export function pickMeetingGuests(candidates: MeetingGuestCandidate[]): string[] {
  const usable = candidates
    .map((c) => ({
      name: c.name,
      depth: c.depth,
      emails: normalizeGuestList(c.meetingGuestEmails),
    }))
    .filter((c) => c.emails.length > 0)
    .sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));

  return usable[0]?.emails ?? [];
}

/**
 * Trim, drop blanks, and de-duplicate case-insensitively while keeping the
 * order people typed. Used on the way in (so the column never stores junk) and
 * on the way out (so rows written before a rule changed still read cleanly).
 */
export function normalizeGuestList(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out.slice(0, MAX_MEETING_GUESTS);
}

export interface InheritedMeetingGuests {
  emails: string[];
  /** Name of the ancestor unit the list comes from, for the UI hint. */
  from: string;
}

/**
 * What a unit would fall back to if it configured no guests of its own: the
 * nearest ANCESTOR with a list. Display-only — `resolveDepartmentMeetingGuests`
 * is what actually picks the guests at scheduling time, and it looks at the
 * person's units rather than at one unit's chain.
 */
export async function resolveInheritedMeetingGuests(
  departmentId: string
): Promise<InheritedMeetingGuests | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { path: true },
  });
  if (!dept) return null;

  // Root-first chain ending with the unit itself — drop that last segment, an
  // own list is not inheritance.
  const ancestorIds = dept.path.split("/").filter(Boolean).slice(0, -1);
  if (ancestorIds.length === 0) return null;

  const ancestors = await prisma.department.findMany({
    where: { id: { in: ancestorIds } },
    select: { id: true, name: true, meetingGuestEmails: true },
  });
  const byId = new Map(ancestors.map((a) => [a.id, a]));

  // Walk the chain from the closest ancestor outwards.
  for (const id of [...ancestorIds].reverse()) {
    const hit = byId.get(id);
    if (!hit) continue;
    const emails = normalizeGuestList(hit.meetingGuestEmails);
    if (emails.length > 0) return { emails, from: hit.name };
  }
  return null;
}
