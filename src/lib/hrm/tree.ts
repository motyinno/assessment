/**
 * Department hierarchy math. Pure: input is the already-fetched id/parentId
 * of every department (local `cuid`s, already resolved from HRM's
 * `parentHrmId` in the pass before this one runs); output is `path`/`depth`
 * for a single write pass.
 *
 * `path` is a "/"-joined chain of ids from root to (and including) the node
 * itself, e.g. "root123/div456/team789" — cheap to query with a `startsWith`
 * for "give me this subtree", which is the whole reason it exists.
 */
import { log } from "@/lib/logger";

export interface DepartmentNode {
  id: string;
  parentId: string | null;
}

export interface DepartmentPathInfo {
  path: string;
  depth: number;
}

/**
 * Roots (parentId null or pointing at an id absent from the input) get
 * depth=0. A department stuck in a cycle, or one whose ancestor chain never
 * reaches a root because of a cycle further up, is a defensive fallback: it
 * gets treated as its own root (depth=0, path=its own id) rather than
 * hanging the whole sync — HRM data is external and not guaranteed
 * cycle-free (see plan risk on `reportsToId`). Logged so it's visible, not
 * silently wrong.
 */
export function rebuildDepartmentPaths(
  departments: DepartmentNode[]
): Map<string, DepartmentPathInfo> {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const result = new Map<string, DepartmentPathInfo>();

  function resolve(id: string, visiting: Set<string>): DepartmentPathInfo {
    const cached = result.get(id);
    if (cached) return cached;

    const node = byId.get(id);
    if (!node) {
      const info: DepartmentPathInfo = { path: id, depth: 0 };
      result.set(id, info);
      return info;
    }

    if (visiting.has(id)) {
      log.warn("hrm: cycle detected in department parentId chain, breaking as root", { id });
      const info: DepartmentPathInfo = { path: id, depth: 0 };
      result.set(id, info);
      return info;
    }

    if (node.parentId === null || !byId.has(node.parentId)) {
      const info: DepartmentPathInfo = { path: id, depth: 0 };
      result.set(id, info);
      return info;
    }

    visiting.add(id);
    const parentInfo = resolve(node.parentId, visiting);
    visiting.delete(id);

    const info: DepartmentPathInfo = {
      path: `${parentInfo.path}/${id}`,
      depth: parentInfo.depth + 1,
    };
    result.set(id, info);
    return info;
  }

  for (const d of departments) {
    resolve(d.id, new Set());
  }

  return result;
}
