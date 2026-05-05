"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

const navItems = [
  { href: "/dashboard", label: "Главная", icon: "home" },
  { href: "/assessments", label: "Ассессменты", icon: "clipboard" },
  { href: "/tech-matrix", label: "Тех. матрица", icon: "grid" },
  { href: "/request-assessment", label: "Запрос ассессмента", icon: "send", hideForAdmin: true },
];

const assessorItems = [
  { href: "/assessment-logs", label: "Журнал ассессментов", icon: "file-text" },
];

const adminItems = [
  { href: "/requests", label: "Заявки", icon: "inbox" },
  { href: "/pdp-review", label: "ИПР на проверке", icon: "file-text" },
  { href: "/users", label: "Пользователи", icon: "users" },
];

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
  };
  return <>{icons[name] || null}</>;
}

export function AppSidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo area */}
      <div className="px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm ring-1 ring-primary/20 group-hover:shadow-md transition-shadow">
            <span className="text-primary-foreground text-[11px] font-bold tracking-wider">PDP</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-sidebar-foreground leading-tight">PDP Generator</h1>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Ассессменты и ИПР</p>
          </div>
        </Link>
      </div>

      <div className="mx-3 h-px bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems
          .filter((item) => !("hideForAdmin" in item && item.hideForAdmin && user.role === "ADMIN"))
          .map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all relative",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <NavIcon
                  name={item.icon}
                  className={cn(
                    "w-[18px] h-[18px] shrink-0 transition-colors",
                    active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

        {(user.role === "ADMIN" || user.role === "ASSESSOR") && (
          <>
            <div className="pt-5 pb-2 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
                Работа с ассессментами
              </p>
            </div>
            {assessorItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all relative",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <NavIcon
                    name={item.icon}
                    className={cn(
                      "w-[18px] h-[18px] shrink-0 transition-colors",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </>
        )}

        {user.role === "ADMIN" && (
          <>
            <div className="pt-5 pb-2 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
                Администрирование
              </p>
            </div>
            {adminItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all relative",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <NavIcon
                    name={item.icon}
                    className={cn(
                      "w-[18px] h-[18px] shrink-0 transition-colors",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-colors">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center text-xs font-semibold shrink-0 ring-1 ring-primary/15">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate text-sidebar-foreground">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
          {user.role !== "USER" && (
            <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md whitespace-nowrap">
              {user.role === "ADMIN" ? "Админ" : "Асессор"}
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground text-[13px] px-2"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <NavIcon name="logout" className="w-4 h-4" />
          Выйти
        </Button>
      </div>
    </aside>
  );
}
