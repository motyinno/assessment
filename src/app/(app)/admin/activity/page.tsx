import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { loadActivityStats } from "@/lib/activity-server";
import { ActivityView } from "@/components/activity-view";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ searchParams }: { searchParams?: { division?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isSuperAdmin(session.user)) redirect("/dashboard");

  return <ActivityView stats={await loadActivityStats(searchParams?.division ?? null)} />;
}
