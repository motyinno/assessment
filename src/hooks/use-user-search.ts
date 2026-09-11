"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared shape returned by GET /api/users for combobox-style consumers.
 * Deliberately slim — combobox UIs never need `grade`/`project`/`manager`.
 */
export interface UserSearchItem {
  id: string;
  name: string;
  email: string;
  role: string;
  isArchived: boolean;
  photoFileName?: string | null;
  jobTitle?: string | null;
  // Raw Prisma join shape from GET /api/users.
  departments?: Array<{ department: { id: string; name: string; isFilterable: boolean } }>;
}

/** First filterable unit's name, for a compact "position · unit" combobox row. */
export function firstDepartmentName(item: UserSearchItem): string | null {
  return item.departments?.find((d) => d.department.isFilterable)?.department.name ?? null;
}

interface UsersEnvelope {
  items: UserSearchItem[];
  total: number;
  page: number;
  pageSize: number;
}

function unwrap(data: UsersEnvelope | UserSearchItem[] | null): UserSearchItem[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.items;
}

export interface UseUserSearchOptions {
  /** Comma-separated role list, e.g. "MANAGER,ADMIN". */
  role?: string;
  pageSize?: number;
  /** Below this many trimmed characters, `items` stays empty and nothing is fetched. */
  minQueryLength?: number;
  debounceMs?: number;
}

/**
 * One hook behind every "search users as you type" combobox (S08 §"Нужен
 * один общий хук"). Debounces input and cancels the in-flight request when
 * the query changes again, so six comboboxes don't grow six slightly
 * different races between keystrokes and responses.
 */
export function useUserSearch({
  role,
  pageSize = 20,
  minQueryLength = 2,
  debounceMs = 250,
}: UseUserSearchOptions = {}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < minQueryLength) {
      abortRef.current?.abort();
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const params = new URLSearchParams({ q, pageSize: String(pageSize) });
      if (role) params.set("role", role);

      fetch(`/api/users?${params.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: UsersEnvelope | UserSearchItem[] | null) => setItems(unwrap(data)))
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setItems([]);
        })
        .finally(() => setLoading(false));
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, role, pageSize, minQueryLength, debounceMs]);

  return { items, loading, query, setQuery };
}

/**
 * Resolves a handful of user ids to their display data via `?ids=`, for
 * hydrating a combobox's already-selected value (which may not be in the
 * current search results, or in any results at all if the query is empty).
 * Caches what it has already fetched across re-renders.
 */
export function useUsersByIds(
  ids: (string | null | undefined)[]
): Record<string, UserSearchItem> {
  const wanted = Array.from(new Set(ids.filter((x): x is string => !!x))).sort();
  const key = wanted.join(",");
  const [map, setMap] = useState<Record<string, UserSearchItem>>({});

  useEffect(() => {
    if (!key) return;
    const missing = wanted.filter((id) => !map[id]);
    if (missing.length === 0) return;

    const controller = new AbortController();
    fetch(`/api/users?ids=${missing.join(",")}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UsersEnvelope | UserSearchItem[] | null) => {
        const list = unwrap(data);
        if (list.length === 0) return;
        setMap((prev) => {
          const next = { ...prev };
          for (const u of list) next[u.id] = u;
          return next;
        });
      })
      .catch(() => {});

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
