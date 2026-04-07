import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <AppSidebar user={session.user} />
      <main className="flex-1 overflow-auto bg-background p-6 lg:p-8">{children}</main>
    </div>
  );
}
