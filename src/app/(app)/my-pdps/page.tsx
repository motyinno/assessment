"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PdpRow {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string };
}

const STATUS_META: Record<string, { label: string; variant: "secondary" | "info" | "warning" | "success" | "destructive" }> = {
  GENERATING: { label: "Generating", variant: "info" },
  ON_REVIEW: { label: "In review", variant: "warning" },
  DRAFT: { label: "Draft", variant: "secondary" },
  ACTIVE: { label: "Active", variant: "info" },
  COMPLETED: { label: "Closed", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export default function MyPdpsPage() {
  const { data: session } = useSession();
  const [pdps, setPdps] = useState<PdpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const meId = (session?.user as { id?: string } | undefined)?.id;
    if (!meId) return;
    fetch("/api/pdps")
      .then((r) => (r.ok ? r.json() : []))
      .then((all: PdpRow[]) => {
        setPdps(all.filter((p) => p.user.id === meId));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Development plans</h1>
          <p className="page-subtitle mt-1">Your personal development plans and their progress</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : pdps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You don&apos;t have any development plans yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {pdps.map((pdp) => {
                const meta = STATUS_META[pdp.status] ?? { label: pdp.status, variant: "secondary" as const };
                const isActionable = pdp.status === "ACTIVE" || pdp.status === "COMPLETED";
                const row = (
                  <div className="px-5 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{pdp.fileName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(pdp.createdAt).toLocaleDateString("en-US")}
                      </p>
                    </div>
                    <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
                  </div>
                );
                return (
                  <li key={pdp.id}>
                    {isActionable ? (
                      <Link href={`/pdps/${pdp.id}`} className="block hover:bg-muted/50 transition-colors">
                        {row}
                      </Link>
                    ) : (
                      <div className="opacity-70">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
