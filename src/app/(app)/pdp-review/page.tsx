"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ReviewUser {
  id: string;
  name: string;
  email: string;
}

interface ReviewCreator extends ReviewUser {
  role: string;
}

interface ReviewPdp {
  id: string;
  fileName: string;
  driveLink: string | null;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
  user: ReviewUser;
  createdBy: ReviewCreator | null;
  assessment: { id: string; title: string } | null;
}

const CREATOR_ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  ASSESSOR: "Assessor",
  USER: "User",
};

export default function PdpReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [pdps, setPdps] = useState<ReviewPdp[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReviewPdp | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchPdps();
  }, [session, status, router]);

  async function fetchPdps() {
    const res = await fetch("/api/pdps/review");
    if (res.ok) setPdps(await res.json());
  }

  function openReview(pdp: ReviewPdp) {
    setSelected(pdp);
    setNotes(pdp.reviewNotes ?? "");
    setOpen(true);
  }

  async function saveNotes() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pdps/${selected.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", reviewNotes: notes }),
      });
      if (res.ok) {
        await fetchPdps();
      }
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!selected) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/pdps/${selected.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        setOpen(false);
        setSelected(null);
        await fetchPdps();
      }
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">PDPs in review</h1>
          <p className="page-subtitle mt-1">
            {pdps.length > 0
              ? `${pdps.length} PDPs awaiting review`
              : "No PDPs awaiting review"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pdps.map((pdp) => (
                <TableRow key={pdp.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/users/${pdp.user.id}`}
                      className="hover:underline"
                    >
                      {pdp.user.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {pdp.createdBy ? (
                      <div className="flex flex-col">
                        <Link
                          href={`/users/${pdp.createdBy.id}`}
                          className="text-sm hover:underline truncate max-w-[180px]"
                          title={pdp.createdBy.email}
                        >
                          {pdp.createdBy.name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">
                          {CREATOR_ROLE_LABEL[pdp.createdBy.role] ?? pdp.createdBy.role}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate" title={pdp.fileName}>
                    {pdp.fileName}
                  </TableCell>
                  <TableCell>
                    {pdp.driveLink ? (
                      <Badge variant="info">Drive</Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(pdp.createdAt).toLocaleDateString("en-US")}
                  </TableCell>
                  <TableCell>
                    {pdp.reviewNotes ? (
                      <Badge variant="warning">Yes</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReview(pdp)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>PDP review</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Employee</p>
                <p className="font-medium">{selected.user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.user.email}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Created by</p>
                {selected.createdBy ? (
                  <>
                    <p className="font-medium">
                      {selected.createdBy.name}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {CREATOR_ROLE_LABEL[selected.createdBy.role] ??
                          selected.createdBy.role}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selected.createdBy.email}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Unknown</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">File</p>
                <p className="font-medium break-words">{selected.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {new Date(selected.createdAt).toLocaleString("en-US")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.driveLink && (
                  <a
                    href={selected.driveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:bg-primary/5 px-3 py-1.5 rounded-md border"
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Open in Drive
                  </a>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes for the assessor</Label>
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What needs to be fixed in the PDP"
                />
                <p className="text-xs text-muted-foreground">
                  The assessor will see these notes on the employee's page. They will be cleared after approval.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={saveNotes}
                  disabled={saving || approving}
                >
                  {saving ? "Saving..." : "Save notes"}
                </Button>
                <Button onClick={approve} disabled={saving || approving}>
                  {approving ? "Approving..." : "Approve"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
