"use client";

import { useEffect, useRef, useState } from "react";

export interface DepartmentOption {
  id: string;
  name: string;
  path: string;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  placeholder?: string;
}

/**
 * Server-side department autocomplete (S09/S10): several hundred units make a
 * `<Select>` with every option unworkable, so this queries
 * `GET /api/departments?filterable=1&q=` per keystroke, same shape as the
 * user-search comboboxes.
 */
export function DepartmentCombobox({ value, onChange, placeholder = "Filter by department" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      // `tree=0` matters: /api/departments defaults to the nested tree shape
      // since S10 (department-tree.tsx needs it), but this picker still wants
      // the flat `items[]` of directly-matching units it always did.
      const params = new URLSearchParams({ filterable: "1", tree: "0" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/departments?${params.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { items: DepartmentOption[] } | null) => setItems(data?.items ?? []))
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setItems([]);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

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
  }, [open]);

  function select(opt: DepartmentOption) {
    onChange(opt.id, opt.name);
    setSelectedName(opt.name);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange(null, null);
    setSelectedName(null);
    setQuery("");
  }

  const inputValue = open ? query : value ? (selectedName ?? "") : "";

  return (
    <div ref={containerRef} className="relative">
      <input
        value={inputValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="h-8 w-full rounded-md border border-input bg-background pl-3 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value && !open && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
          aria-label="Clear department filter"
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
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">No units match.</li>
          ) : (
            items.map((opt) => (
              <li
                key={opt.id}
                role="option"
                aria-selected={opt.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(opt);
                }}
                className="px-3 py-1.5 cursor-pointer text-sm hover:bg-accent/50"
              >
                {opt.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
