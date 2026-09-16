import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManagePeople, isSuperAdmin } from "@/lib/roles";
import { buildDepartmentTree, loadDepartmentData, pruneEmpty } from "@/lib/departments";
import { DepartmentTree } from "@/components/department-tree";

/**
 * S10 — org structure tree. Was open to every authenticated user (F5); now
 * restricted to SUPER_ADMIN. First paint comes from the server (no
 * client-side fetch-on-mount flicker); search/archive-toggle refetches
 * happen client-side from department-tree.tsx.
 */
export default async function DepartmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isSuperAdmin(session.user)) redirect("/dashboard");

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
