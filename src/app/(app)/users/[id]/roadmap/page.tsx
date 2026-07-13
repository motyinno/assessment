"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { RoadmapView } from "@/components/roadmap-view";
import { isStaff, isAdmin, canManagePeople } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Read/edit a specific user's roadmap. Staff-only page (mirrors /users/[id]);
 * managers/admins can edit their reports' progress, assessors view read-only.
 * The API enforces the same access, so this UI guard is just UX.
 */
export default function UserRoadmapPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = params.id as string;

  const me = session?.user as { id?: string; role?: string } | undefined;
  const [target, setTarget] = useState<{ name: string; managerId: string | null } | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!isStaff(me?.role)) {
      router.push("/dashboard");
      return;
    }
    fetch(`/api/users/${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTarget({ name: d.name, managerId: d.managerId ?? null }))
      .catch(() => setTarget(null));
  }, [status, me?.role, userId, router]);

  const canEdit =
    isAdmin(me?.role) ||
    (canManagePeople(me?.role) && !!target && target.managerId === me?.id) ||
    me?.id === userId;

  if (status === "loading" || !isStaff(me?.role)) {
    return <p className="p-8 text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/users/${userId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
      >
        <ArrowLeft />
        Back to profile
      </Link>
      <div>
        <h1 className="text-2xl font-bold">
          {target ? `${target.name}'s roadmap` : "Roadmap"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canEdit
            ? "Skill roadmap — tick off questions as they're covered."
            : "Skill roadmap (read-only)."}
        </p>
      </div>
      <RoadmapView userId={userId} canEdit={canEdit} />
    </div>
  );
}
