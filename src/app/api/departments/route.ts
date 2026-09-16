import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { canManagePeople } from "@/lib/roles";
import {
  buildDepartmentTree,
  loadDepartmentData,
  pruneEmpty,
  toDepartmentItem,
} from "@/lib/departments";

/**
 * GET /api/departments — full S10 contract, upgraded in place from the S09
 * minimal version (see S10-departments-screen-PLAN.md §1). Existing
 * consumers only relied on `items[].{id,name,path}` plus `?q=` and
 * `?filterable=1` with `tree` omitted meaning "flat" — that combination is
 * preserved below (department-combobox.tsx now passes `tree=0` explicitly,
 * since `tree` now defaults to 1).
 *
 * ?tree=1        tree (default) | ?tree=0 flat list
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
  const survivors = pruneEmpty(data.all, data, filterableOnly);

  if (!treeMode) {
    let flatItems = survivors;
    if (q) flatItems = flatItems.filter((d) => d.name.toLowerCase().includes(q));
    flatItems = flatItems.slice(0, 50);
    return NextResponse.json({ items: flatItems.map((d) => toDepartmentItem(d, data)) });
  }

  // Tree mode: always build the whole surviving tree (a client can't expand a
  // node that isn't in the response) — `q` only decides which ids get flagged
  // to force-expand.
  const tree = buildDepartmentTree(survivors, data);

  let expandedIds: string[] | undefined;
  if (q) {
    const matched = new Set(
      survivors.filter((d) => d.name.toLowerCase().includes(q)).map((d) => d.id)
    );
    const expand = new Set<string>();
    for (const id of matched) {
      const node = data.all.find((d) => d.id === id);
      if (!node) continue;
      // `path` is a "/"-joined id chain root-first — every segment is an
      // ancestor (or the node itself) that needs to be forced open.
      for (const ancestorId of node.path.split("/")) expand.add(ancestorId);
    }
    expandedIds = Array.from(expand);
  }

  return NextResponse.json({ items: tree, ...(expandedIds ? { expandedIds } : {}) });
}
