import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManagePeople } from "@/lib/roles";
import { buildDepartmentTree, loadDepartmentData, pruneEmpty } from "@/lib/departments";
import { DepartmentTree } from "@/components/department-tree";

/**
 * S10 — org structure tree. This is the company org chart, so every signed-in
 * person sees all of it: it used to be ADMIN-only and, for a plain ADMIN,
 * narrowed to their own subtree by `getAdminDepartmentScope` — which would now
 * mean an ADMIN sees LESS of the chart than a regular user. Nothing sensitive
 * is on it either way: department pages only ever expose DEPARTMENT_MEMBER_SLIM
 * (name, email, job title, photo) to every role alike — grade, projects and
 * manager never appear here (see lib/departments.ts).
 *
 * First paint comes from the server (no client-side fetch-on-mount flicker);
 * search/archive-toggle refetches happen client-side from department-tree.tsx.
 */
export default async function DepartmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canManageArchive = canManagePeople(session.user.role);
  const data = await loadDepartmentData(false);
  const survivors = pruneEmpty(data.all, data, false);
  const tree = buildDepartmentTree(survivors, data);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle mt-1">Org structure — units, headcount, and unit heads.</p>
        </div>
      </div>

      <DepartmentTree initialItems={tree} canManageArchive={canManageArchive} />
    </div>
  );
}
