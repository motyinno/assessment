"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { useUserSearch, type UserSearchItem } from "@/hooks/use-user-search";

const roleLabels: Record<string, string> = {
  ASSESSOR: "Assessor",
  MANAGER: "Manager",
  ADMIN: "Admin",
  USER: "User",
};

/**
 * Searchable single-select for adding an assessor. Selecting a person fires
 * onSelect immediately (no separate "Add" click). Options come from a
 * server-side search (S08) — the directory can be thousands of rows — filtered
 * by `role` and, client-side, by `excludeIds` (people already on the roster,
 * or the subject's own manager: filters that need the caller's own state and
 * so can't be pushed onto the server query).
 */
export function AssessorCombobox({
  role = "ASSESSOR,MANAGER,ADMIN",
  excludeIds,
  onSelect,
  disabled,
  placeholder = "Search assessors or managers…",
  triggerLabel = "Add an assessor",
}: {
  role?: string;
  excludeIds?: Set<string>;
  onSelect: (user: UserSearchItem) => void;
  disabled?: boolean;
  placeholder?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { items, loading, query, setQuery } = useUserSearch({ role, minQueryLength: 0 });
  const filtered = excludeIds ? items.filter((o) => !excludeIds.has(o.id)) : items;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function choose(user: UserSearchItem) {
    onSelect(user);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="inline-flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {triggerLabel}
        </span>
        <svg
          className="w-4 h-4 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Searching…
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {query ? "No matches" : "No eligible assessors"}
              </p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => choose(o)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar user={o} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.email}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {roleLabels[o.role] ?? o.role}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
