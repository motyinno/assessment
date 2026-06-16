"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface QueueItem {
  id: string;
  type: "THEORY" | "PRACTICE";
  category: string;
  title: string;
  evidenceLink: string | null;
  submittedAt: string | null;
  pdp: {
    id: string;
    fileName: string;
    user: { id: string; name: string; email: string };
  };
}

export default function PdpReviewQueuePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      router.push("/dashboard");
      return;
    }
    fetch("/api/pdps/review-queue")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: QueueItem[]) => {
        setItems(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, status, router]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">PDP tasks to review</h1>
          <p className="page-subtitle mt-1">
            {items.length > 0
              ? `${items.length} task${items.length === 1 ? "" : "s"} awaiting your review`
              : "No tasks awaiting review"}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing to review right now.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/pdps/${item.pdp.id}`}
                    className="block px-5 py-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={item.type === "PRACTICE" ? "info" : "secondary"} className="shrink-0">
                            {item.type === "PRACTICE" ? "Practice" : "Theory"}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">{item.category}</span>
                        </div>
                        <p className="text-sm mt-1.5">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.pdp.user.name} · {item.pdp.fileName}
                        </p>
                      </div>
                      {item.submittedAt && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(item.submittedAt).toLocaleDateString("en-US")}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
