"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserAvatar } from "@/components/user-avatar";
import { ClimbTile } from "@/components/brand/climb-mark";
import { ClimbLoader } from "@/components/brand/climb-loader";
import { activeNav, visibleSections, type VisibleSection } from "@/lib/nav-sections";

interface SidebarProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isSuperAdmin?: boolean;
    photoFileName?: string | null;
  };
}

function NavIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    clipboard: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="12" y2="18" />
      </svg>
    ),
    "file-text": (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    send: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    inbox: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    grid: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    users: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    logout: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
    user: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    "bar-chart": (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
    sliders: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
    refresh: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    // lucide "message-square" glyph — interview questions.
    message: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    // lucide "network" glyph — org-chart shape, used for Departments (S10).
    mountain: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20 L12 5 L22 20 Z" />
        <path d="M7.5 20 L13.5 17.5 L9.5 14.5 L13 11.5" />
        <path d="M12 5 V2 L15.5 3 L12 4" />
      </svg>
    ),
    shield: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    sitemap: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <path d="M12 8v4M12 12H5v4M12 12h7v4" />
      </svg>
    ),
  };
  return <>{icons[name] || null}</>;
}

/** Nav icon, or the climbing loader while that link's page is on its way. */
function NavGlyph({ pending, ...props }: { pending: boolean; name: string; className?: string }) {
  if (pending) return <ClimbLoader size="sm" className="w-[18px] h-[18px] shrink-0 justify-center text-sidebar-primary" />;
  return <NavIcon {...props} />;
}

export function AppSidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  // Bumped on logo hover to remount the mark and replay its intro.
  const [logoPlay, setLogoPlay] = useState(0);
  // Link clicked but its page not rendered yet: give feedback right away
  // instead of a frozen screen while the server renders (or dev compiles).
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [pathname]);

  const trackPending = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (href && href.startsWith("/") && href !== pathname) setPending(href);
  };

  const sections = visibleSections(user);
  const activeId = activeNav(sections, pathname)?.section.id;
  const navLink = (section: VisibleSection) => {
    const active = section.id === activeId;
    return (
      <Link
        key={section.id}
        href={section.href}
        className={cn(
          "group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all relative",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <NavGlyph
          pending={pending === section.href}
          name={section.icon}
          className={cn(
            "w-[18px] h-[18px] shrink-0 transition-colors",
            active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80"
          )}
        />
        <span className="truncate">{section.label}</span>
      </Link>
    );
  };
  const adminSections = sections.filter((s) => s.group === "admin");

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border"
      onClickCapture={trackPending}
    >
      {pending && (
        <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
          <div className="climb-progress h-full bg-trail" />
        </div>
      )}
      {/* Logo area */}
      <div className="flex items-center justify-between gap-2 px-5 py-5">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-3 group"
          onMouseEnter={() => setLogoPlay((n) => n + 1)}
        >
          <ClimbTile key={logoPlay} animated className="size-9 group-hover:shadow-md transition-shadow" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-sidebar-foreground leading-tight">Node Assessment</h1>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Assessments & PDPs</p>
          </div>
        </Link>
        <NotificationBell />
      </div>

      <div className="mx-3 h-px bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {sections.filter((s) => s.group === "main").map(navLink)}
        {adminSections.length > 0 && (
          <>
            <div className="pt-5 pb-2 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
                Administration
              </p>
            </div>
            {adminSections.map(navLink)}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-colors">
          <UserAvatar user={user} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate text-sidebar-foreground">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
          {user.role !== "USER" && (
            <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md whitespace-nowrap">
              {user.role === "ADMIN"
                ? "Admin"
                : user.role === "MANAGER"
                  ? "Manager"
                  : "Assessor"}
            </span>
          )}
        </Link>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground text-[13px] px-2"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <NavIcon name="logout" className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
