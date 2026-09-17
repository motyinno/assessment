"use client";

import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface DivisionOption {
  id: string;
  name: string;
}

/** Sentinels — a `<Select>` can't hold `null`, and "" is its empty state. */
const ALL = "__all__";
const NONE = "none";

interface Props {
  /** `null` = every division; "none" = people the sync resolved no division for. */
  value: string | null;
  onChange: (divisionId: string | null) => void;
  className?: string;
}

/**
 * Division picker — a plain `<Select>`, not a search combobox like
 * `DepartmentCombobox`: there are a few dozen Divisions company-wide (against
 * several hundred units at every other level), so the whole list fits, and
 * "which division" is a choice people make from a menu rather than by typing.
 *
 * Scoped server-side: a plain admin only gets back the divisions inside their
 * own department scope (see /api/departments), so this needs no role logic.
 */
export function DivisionSelect({ value, onChange, className }: Props) {
  const [items, setItems] = useState<DivisionOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/departments?tree=0&filterable=1&type=Division", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items: DivisionOption[] } | null) => setItems(data?.items ?? []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setItems([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => {
        if (typeof v !== "string" || !v) return;
        onChange(v === ALL ? null : v);
      }}
    >
      <SelectTrigger className={className}>
        {/* The trigger renders the VALUE unless told otherwise, and our values
            are ids/sentinels — so map back to the name here, same pattern as
            the grade select on the users page. */}
        <SelectValue placeholder="All divisions">
          {(v) => {
            if (typeof v !== "string" || !v || v === ALL) return "All divisions";
            if (v === NONE) return "No division";
            return items.find((d) => d.id === v)?.name ?? "…";
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All divisions</SelectItem>
        {items.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
        <SelectItem value={NONE}>No division</SelectItem>
      </SelectContent>
    </Select>
  );
}
