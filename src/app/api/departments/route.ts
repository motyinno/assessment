import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { canManagePeople } from "@/lib/roles";
import {
  loadDepartmentData,
  toDepartmentItem,
  type DepartmentItem,
  type DepartmentRow,
} from "@/lib/departments";

interface TreeItem extends DepartmentItem {
  children?: TreeItem[];
}

/**
 * GET /api/departments — full S10 contract, upgraded in place from the S09
 * minimal version (see comment history / S10-departments-screen-PLAN.md §1).
 * Existing consumers only relied on `items[].{id,name,path}` plus `?q=` and
 * `?filterable=1` with `tree` omitted meaning "flat" — that combination is
 * preserved below (department-combobox.tsx now passes `tree=0` explicitly).
 *
 * ?tree=1        dereo (default) | ?tree=0 flat list
 * ?filterable=1  only isFilterable units (selectors — excludes isSinglePerson
 *                positions like CEO, which HRM itself marks unfilterable)
 * ?q=            name search
 * ?archived=include   count archived memberships too (canManagePeople gate)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const sp = req.nextUrl.searchParams;
  const treeMode = sp.get("tree") !== "0";
  const filterableOnly = sp.get("filterable") === "1";
  const q = sp.get("q")?.trim().toLowerCase() ?? "";
  const includeArchived = sp.get("archived") === "include" && canManagePeople(me.role);

  const data = await loadDepartmentData(includeArchived);

  // F2 "Правила отображения": empty units (0 active memberships anywhere in
  // their own subtree) are noise, don't show. Safe to prune wholesale here —
  // if a node's memberCountWithDescendants is 0, every descendant's is too
  // (the sum only grows going down), so nothing downstream gets orphaned.
  let survivors: DepartmentRow[] = data.all.filter(
    (d) => (data.withDescendants.get(d.id) ?? 0) > 0
  );
  if (filterableOnly) {
    survivors = survivors.filter((d) => d.isFilterable);
  }

  if (!treeMode) {
    let items = survivors;
    if (q) {
      items = items.filter((d) => d.name.toLowerCase().includes(q));
    }
    items = items.slice(0, 50);
    return NextResponse.json({
      items: items.map((d) => toDepartmentItem(d, data)),
    });
  }

  // Tree mode: always build the whole surviving tree (a client can't expand a
  // node that isn't in the response) — `q` only decides which ids get flagged
  // to force-expand, filtering happens client-side against the full payload.
  const survivorIds = new Set(survivors.map((d) => d.id));
  const childrenOf = new Map<string, DepartmentRow[]>();
  const roots: DepartmentRow[] = [];
  for (const d of survivors) {
    const parentKnown = d.parentId !== null && survivorIds.has(d.parentId);
    if (parentKnown) {
      const list = childrenOf.get(d.parentId as string) ?? [];
      list.push(d);
      childrenOf.set(d.parentId as string, list);
    } else {
      roots.push(d);
    }
  }

  const matchedIds = new Set<string>();
  if (q) {
    for (const d of survivors) {
      if (d.name.toLowerCase().includes(q)) matchedIds.add(d.id);
    }
  }
  // Ancestors of every match, via the "/"-joined `path` chain — the cheapest
  // way to climb to root without re-walking parentId.
  const expandedIds = new Set<string>();
  for (const id of matchedIds) {
    const node = data.all.find((d) => d.id === id);
    if (!node) continue;
    for (const ancestorId of node.path.split("/")) {
      expandedIds.add(ancestorId);
    }
  }

  function build(node: DepartmentRow): TreeItem {
    const kids = childrenOf.get(node.id) ?? [];
    return {
      ...toDepartmentItem(node, data),
      children: kids.map(build),
    };
  }

  return NextResponse.json({
    items: roots.map(build),
    ...(q ? { expandedIds: Array.from(expandedIds) } : {}),
  });
}
