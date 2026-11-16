"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNav, visibleSections, type NavUser } from "@/lib/nav-sections";
import { cn } from "@/lib/utils";

/**
 * Tabs of the current sidebar section, shown on top of the page itself (not
 * on its sub-pages) when the section has more than one tab for this user.
 */
export function SectionTabs({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const active = activeNav(visibleSections(user), pathname);
  if (!active || active.section.tabs.length < 2 || pathname !== active.tab.href) return null;

  return (
    // The base line is an inset shadow, not a border, so the active tab's
    // underline can sit on it without overflowing — which used to show a scrollbar.
    <nav
      aria-label={active.section.label}
      className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {active.section.tabs.map((tab) => {
        const current = tab.href === active.tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors",
              current
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
