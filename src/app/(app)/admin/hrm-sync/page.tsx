import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/roles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HrmSyncRuns } from "@/components/hrm-sync-runs";
import { HrmSyncIssues } from "@/components/hrm-sync-issues";

export default async function HrmSyncPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role)) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">HRM Sync</h1>
        <p className="text-sm text-muted-foreground">
          Nightly HRM sync runs and everything that needs a human look.
        </p>
      </div>
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="issues">Exceptions</TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="pt-4">
          <HrmSyncRuns />
        </TabsContent>
        <TabsContent value="issues" className="pt-4">
          <HrmSyncIssues />
        </TabsContent>
      </Tabs>
    </div>
  );
}
