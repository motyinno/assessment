"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useUserSearch, useUsersByIds, type UserSearchItem } from "@/hooks/use-user-search";

export type ManagerOption = UserSearchItem;

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeId?: string;
  placeholder?: string;
}

/**
 * Manager picker. Options come from a server-side search (S08) instead of a
 * pre-loaded `options` prop — the directory can be thousands of rows, so we
 * ask `/api/users?role=MANAGER,ADMIN&q=...` per keystroke instead of holding
 * everything in memory and slicing it client-side.
 */
export function ManagerCombobox({
  value,
  onChange,
  excludeId,
  placeholder = "Start typing a name or email",
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { items, loading, query, setQuery } = useUserSearch({
    role: "MANAGER,ADMIN",
    minQueryLength: 0,
  });
  const byId = useUsersByIds([value]);
  const selected = value ? byId[value] ?? null : null;

  const matches = useMemo(
    () => items.filter((u) => u.id !== excludeId && !u.isArchived),
    [items, excludeId]
  );

  const inputValue = open ? query : selected?.name ?? "";

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, setQuery]);

  function selectOption(opt: ManagerOption) {
    onChange(opt.id);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange(null);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Input
            value={inputValue}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlighted(0);
            }}
            onFocus={() => {
              setOpen(true);
              setQuery("");
            }}
            onKeyDown={(e) => {
              if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                setOpen(true);
                return;
              }
              if (!open) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlighted((h) => Math.min(h + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && matches[highlighted]) {
                e.preventDefault();
                selectOption(matches[highlighted]);
              } else if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
              } else if (e.key === "Backspace" && !query && selected) {
                e.preventDefault();
                clear();
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
          />
          {selected && !open && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              aria-label="Clear manager"
            >
              ×
            </button>
          )}
          {open && (
            <ul
              className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-md ring-1 ring-foreground/5"
              role="listbox"
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
              ) : matches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No managers match.
                </li>
              ) : (
                matches.map((opt, idx) => {
                  const active = idx === highlighted;
                  return (
                    <li
                      key={opt.id}
                      role="option"
                      aria-selected={active}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectOption(opt);
                      }}
                      onMouseEnter={() => setHighlighted(idx)}
                      className={
                        "px-3 py-1.5 cursor-pointer text-sm " +
                        (active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50")
                      }
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar user={opt} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{opt.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {opt.email} · {opt.role === "ADMIN" ? "Admin" : "Manager"}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
        {selected?.isArchived && !open && (
          <Badge variant="outline" className="shrink-0">
            Архив
          </Badge>
        )}
      </div>
    </div>
  );
}
