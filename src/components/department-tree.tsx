"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { MULTI_MEMBERSHIP_NOTE } from "@/lib/departments-copy";

export interface DepartmentTreeHead {
  id: string;
  name: string;
  jobTitle: string | null;
  photoFileName: string | null;
}

export interface DepartmentTreeNode {
  id: string;
  hrmId: number;
  name: string;
  typeName: string | null;
  isFilterable: boolean;
  isSinglePerson: boolean;
  parentId: string | null;
  depth: number;
  path: string;
  memberCount: number;
  memberCountWithDescendants: number;
  head: DepartmentTreeHead | null;
  children?: DepartmentTreeNode[];
}

interface DepartmentTreeResponse {
  items: DepartmentTreeNode[];
  expandedIds?: string[];
}

function collectIds(nodes: DepartmentTreeNode[]): string[] {
  return nodes.map((n) => n.id);
}

function parseOpenParam(value: string | null): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TreeNode({
  node,
  depth,
  openIds,
  toggle,
}: {
  node: DepartmentTreeNode;
  depth: number;
  openIds: Set<string>;
  toggle: (id: string) => void;
}) {
  const hasChildren = !!node.children && node.children.length > 0;
  const isOpen = hasChildren && openIds.has(node.id);

  return (
    <Collapsible open={isOpen} onOpenChange={() => hasChildren && toggle(node.id)}>
      <div
        className="flex items-center gap-2 py-1.5 pr-3 border-b border-border/50 last:border-0 hover:bg-accent/40"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        {hasChildren ? (
          <CollapsibleTrigger
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            <ChevronIcon open={isOpen} />
          </CollapsibleTrigger>
        ) : (
          <span className="w-5 h-5 shrink-0" aria-hidden />
        )}

        <span className="text-sm font-medium text-foreground truncate">{node.name}</span>
        {node.typeName && (
          <Badge variant="outline" className="shrink-0">
            {node.typeName}
          </Badge>
        )}

        <span
          className="text-xs text-muted-foreground shrink-0 tabular-nums"
          title={`In unit: ${node.memberCount}. Including sub-units: ${node.memberCountWithDescendants}.`}
        >
          {node.memberCount} / {node.memberCountWithDescendants}
        </span>

        <span className="flex items-center gap-1.5 min-w-0 shrink-0 text-xs text-muted-foreground">
          {node.head ? (
            <>
              <UserAvatar user={node.head} size="sm" />
              <span className="truncate max-w-[140px]">{node.head.name}</span>
            </>
          ) : (
            <span>—</span>
          )}
        </span>

        <Link
          href={`/departments/${node.id}`}
          className="ml-auto shrink-0 text-xs text-primary hover:underline"
        >
          Open
        </Link>
      </div>

      {hasChildren && (
        <CollapsibleContent>
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} openIds={openIds} toggle={toggle} />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

interface Props {
  initialItems: DepartmentTreeNode[];
  canManageArchive: boolean;
}

/**
 * Client-side expand/collapse tree over the server-rendered first page
 * (`initialItems`) — search and the archive toggle re-fetch from
 * `/api/departments?tree=1`, everything else (expand state) is local + URL.
 */
export function DepartmentTree({ initialItems, canManageArchive }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<DepartmentTreeNode[]>(initialItems);
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    // Roots start expanded by default (S10 plan §4) even if `?open=` doesn't
    // name them yet; the effect below then writes that into the URL so a
    // reload doesn't need special-case "no param = roots open" logic.
    return new Set([...collectIds(initialItems), ...parseOpenParam(searchParams.get("open"))]);
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showArchived, setShowArchived] = useState(searchParams.get("archived") === "include");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isFirstFetch = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Keep `?open=` in sync with the open set (replace, not push — expanding a
  // node shouldn't add a back-button stop). Criterion: reload preserves
  // expand state.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const serialized = Array.from(openIds).join(",");
    if (serialized) params.set("open", serialized);
    else params.delete("open");
    const next = `${pathname}?${params.toString()}`;
    const current = `${pathname}?${searchParams.toString()}`;
    if (next !== current) router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIds]);

  useEffect(() => {
    if (isFirstFetch.current) {
      // Skip the fetch on mount — initialItems is already the server's
      // first page; only search/archive changes need a round trip.
      isFirstFetch.current = false;
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    const params = new URLSearchParams({ tree: "1" });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (showArchived && canManageArchive) params.set("archived", "include");
    fetch(`/api/departments?${params.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DepartmentTreeResponse | null) => {
        if (!data) return;
        setItems(data.items);
        setOpenIds((prev) => {
          const next = new Set(prev);
          for (const id of collectIds(data.items)) next.add(id);
          for (const id of data.expandedIds ?? []) next.add(id);
          return next;
        });
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, showArchived]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search units"
            className="h-8 text-xs"
          />
        </div>
        {canManageArchive && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archive" : "Show archive"}
          </Button>
        )}
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <p className="text-xs text-muted-foreground">{MULTI_MEMBERSHIP_NOTE}</p>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No units match.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {items.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} openIds={openIds} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}
