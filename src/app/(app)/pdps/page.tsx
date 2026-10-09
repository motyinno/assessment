import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/roles";
import { AdminPdpList } from "@/components/admin-pdp-list";
import { PdpStatsCards } from "@/components/pdp-stats-cards";

export default async function PdpsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">PDPs</h1>
          <p className="page-subtitle mt-1">
            Every development plan in your division. Active plans are shown by default.
          </p>
        </div>
      </div>
      <PdpStatsCards />
      <AdminPdpList />
    </div>
  );
}
