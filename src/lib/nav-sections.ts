/**
 * The app's navigation: a few sidebar sections, each a set of tabs (pages).
 * The sidebar shows one link per section a user can see, pointing at their
 * first visible tab; the page shows the section's tabs on top when there is
 * more than one. Pages keep their own URLs, so old links still land.
 * Client-safe.
 */

export interface NavUser {
  role: string;
  isSuperAdmin?: boolean;
}

export interface NavTab {
  href: string;
  label: string | ((u: NavUser) => string);
  /** Match only the exact path, not sub-pages. */
  exact?: boolean;
  visible?: (u: NavUser) => boolean;
}

export interface NavSection {
  id: string;
  label: string;
  icon: string;
  /** Sidebar group: everyday pages, or the admin block below them. */
  group: "main" | "admin";
  tabs: NavTab[];
}

const is = (...roles: string[]) => (u: NavUser) => roles.includes(u.role);
/** Same rule as lib/roles isSuperAdmin: the flag only counts on an admin. */
const superAdmin = (u: NavUser) => u.role === "ADMIN" && Boolean(u.isSuperAdmin);

export const NAV_SECTIONS: NavSection[] = [
  { id: "dashboard", label: "Dashboard", icon: "home", group: "main", tabs: [{ href: "/dashboard", label: "Dashboard" }] },
  { id: "climb", label: "My Climb", icon: "mountain", group: "main", tabs: [{ href: "/climb", label: "My Climb" }] },
  {
    id: "assessments",
    label: "Assessments",
    icon: "clipboard",
    group: "main",
    tabs: [
      { href: "/assessments", label: (u) => (u.role === "ADMIN" || u.role === "ASSESSOR" ? "All" : "My assessments") },
      { href: "/request-assessment", label: "Request", visible: (u) => u.role !== "ADMIN" },
      { href: "/requests", label: "Requests", visible: is("ADMIN") },
      { href: "/assessment-review", label: "Review", visible: is("ADMIN") },
      { href: "/assessment-logs", label: "Log", visible: is("ADMIN", "ASSESSOR", "MANAGER") },
    ],
  },
  {
    id: "matrix",
    label: "Tech Matrix",
    icon: "grid",
    group: "main",
    tabs: [{ href: "/tech-matrix", label: "Tech Matrix", exact: true }],
  },
  {
    id: "people",
    label: "People",
    icon: "users",
    group: "main",
    tabs: [
      { href: "/my-team", label: "My team", visible: is("MANAGER") },
      { href: "/users", label: "Users", visible: is("MANAGER", "ADMIN") },
      { href: "/departments", label: "Org chart" },
    ],
  },
  { id: "pdps", label: "PDPs", icon: "file-text", group: "admin", tabs: [{ href: "/pdps", label: "PDPs", visible: is("ADMIN") }] },
  {
    id: "statistics",
    label: "Statistics",
    icon: "bar-chart",
    group: "admin",
    tabs: [{ href: "/assessment-statistics", label: "Statistics", visible: is("ADMIN") }],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "sliders",
    group: "admin",
    tabs: [
      { href: "/tech-matrix/edit", label: "Tech matrix", visible: is("ADMIN") },
      { href: "/session-templates", label: "Session templates", visible: is("ADMIN") },
      // Questions from real client interviews, attached to matrix topics (lib/question-bank.ts).
      { href: "/interview-questions", label: "Interview questions", visible: is("ADMIN") },
    ],
  },
  {
    id: "super",
    label: "Super admin",
    icon: "shield",
    group: "admin",
    tabs: [
      { href: "/admin/activity", label: "Activity", visible: superAdmin },
      { href: "/admin/hrm-sync", label: "HRM sync", visible: superAdmin },
    ],
  },
];

export interface VisibleSection {
  id: string;
  label: string;
  icon: string;
  group: "main" | "admin";
  href: string;
  tabs: Array<{ href: string; label: string; exact: boolean }>;
}

/** Sections the user can see, with only their visible tabs; empty sections drop out. */
export function visibleSections(user: NavUser): VisibleSection[] {
  return NAV_SECTIONS.flatMap((s) => {
    const tabs = s.tabs
      .filter((t) => !t.visible || t.visible(user))
      .map((t) => ({ href: t.href, label: typeof t.label === "function" ? t.label(user) : t.label, exact: Boolean(t.exact) }));
    if (!tabs.length) return [];
    return [{ id: s.id, label: s.label, icon: s.icon, group: s.group, href: tabs[0].href, tabs }];
  });
}

const matches = (pathname: string, tab: { href: string; exact: boolean }) =>
  pathname === tab.href || (!tab.exact && pathname.startsWith(tab.href + "/"));

/**
 * The section and tab a path belongs to — the longest matching tab wins, so
 * /tech-matrix/edit is Settings, not the matrix viewer.
 */
export function activeNav(sections: VisibleSection[], pathname: string) {
  let best: { section: VisibleSection; tab: VisibleSection["tabs"][number] } | null = null;
  for (const section of sections) {
    for (const tab of section.tabs) {
      if (matches(pathname, tab) && (!best || tab.href.length > best.tab.href.length)) best = { section, tab };
    }
  }
  return best;
}
