"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ItemStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "VERIFIED" | "REWORK";

interface PdpItem {
  id: string;
  type: "THEORY" | "PRACTICE";
  category: string;
  title: string;
  status: ItemStatus;
  evidenceLink: string | null;
  evidenceNote: string | null;
  reviewComment: string | null;
  reviewer: { id: string; name: string } | null;
}

interface PdpDetail {
  id: string;
  fileName: string;
  driveLink: string | null;
  status: string;
  user: { id: string; name: string; email: string; managerId: string | null };
  assessment: { id: string; title: string } | null;
  items: PdpItem[];
}

const STATUS_META: Record<ItemStatus, { label: string; variant: "secondary" | "info" | "warning" | "success" | "destructive" }> = {
  NOT_STARTED: { label: "Not started", variant: "secondary" },
  IN_PROGRESS: { label: "In progress", variant: "info" },
  SUBMITTED: { label: "On review", variant: "warning" },
  VERIFIED: { label: "Verified", variant: "success" },
  REWORK: { label: "Needs rework", variant: "destructive" },
};

export default function PdpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [pdp, setPdp] = useState<PdpDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchPdp = useCallback(async () => {
    const res = await fetch(`/api/pdps/${id}`);
    if (res.ok) setPdp(await res.json());
    else if (res.status === 404 || res.status === 403) setNotFound(true);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchPdp();
  }, [fetchPdp]);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (notFound || !pdp) return <p className="text-destructive">PDP not found</p>;

  const meId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isOwner = meId === pdp.user.id;
  const isAdmin = role === "ADMIN";

  const verified = pdp.items.filter((i) => i.status === "VERIFIED").length;
  const total = pdp.items.length;
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;
  const isClosed = pdp.status === "COMPLETED";

  // Group items by category, preserving first-seen order.
  const groups: { category: string; items: PdpItem[] }[] = [];
  for (const item of pdp.items) {
    let g = groups.find((x) => x.category === item.category);
    if (!g) {
      g = { category: item.category, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/my-pdps" className="hover:text-foreground transition-colors">
          Development plans
        </Link>
        <span>/</span>
        <span className="text-foreground/70 truncate">{pdp.fileName}</span>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight break-words">{pdp.fileName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {pdp.user.name}
                {isClosed && (
                  <Badge variant="success" className="ml-2">Closed</Badge>
                )}
              </p>
            </div>
            {pdp.driveLink && (
              <a
                href={pdp.driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:bg-primary/5 px-3 py-1.5 rounded-md border"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open document
              </a>
            )}
          </div>

          {total > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{verified} / {total} verified</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This plan has no trackable tasks. Checklists are generated for AI-built PDPs.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g.category}>
              <CardHeader>
                <CardTitle className="text-base">{g.category}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {g.items.map((item) => (
                    <PdpItemRow
                      key={item.id}
                      pdpId={pdp.id}
                      item={item}
                      isOwner={isOwner && !isClosed}
                      canReview={(isAdmin || meId === item.reviewer?.id) && !isClosed}
                      onChanged={fetchPdp}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PdpItemRow({
  pdpId,
  item,
  isOwner,
  canReview,
  onChanged,
}: {
  pdpId: string;
  item: PdpItem;
  isOwner: boolean;
  canReview: boolean;
  onChanged: () => void;
}) {
  const [link, setLink] = useState(item.evidenceLink ?? "");
  const [note, setNote] = useState(item.evidenceNote ?? "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meta = STATUS_META[item.status];

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pdps/${pdpId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || "Action failed");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = item.status === "IN_PROGRESS" || item.status === "REWORK";

  return (
    <li className="px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={item.type === "PRACTICE" ? "info" : "secondary"} className="shrink-0">
              {item.type === "PRACTICE" ? "Practice" : "Theory"}
            </Badge>
            <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
          </div>
          <p className="text-sm mt-1.5">{item.title}</p>
        </div>
      </div>

      {/* Submitted evidence (visible once provided) */}
      {(item.evidenceLink || item.evidenceNote) && item.status !== "IN_PROGRESS" && (
        <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/50 px-3 py-2">
          {item.evidenceLink && (
            <a href={item.evidenceLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
              {item.evidenceLink}
            </a>
          )}
          {item.evidenceNote && <p className="whitespace-pre-wrap">{item.evidenceNote}</p>}
        </div>
      )}

      {/* Reviewer's rework comment shown to the owner */}
      {item.status === "REWORK" && item.reviewComment && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive">Reviewer comment</p>
          <p className="text-xs text-foreground whitespace-pre-wrap mt-0.5">{item.reviewComment}</p>
        </div>
      )}

      {/* Owner controls */}
      {isOwner && item.status === "NOT_STARTED" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "start" })}>
          Start
        </Button>
      )}
      {isOwner && canSubmit && (
        <div className="space-y-2">
          {item.type === "PRACTICE" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Link to your implementation</Label>
              <Input
                type="url"
                placeholder="https://github.com/..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="h-9"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Answer / notes (optional)</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Short answer, link to your notes, or leave empty"
              />
            </div>
          )}
          <Button
            size="sm"
            disabled={busy || (item.type === "PRACTICE" && !link.trim())}
            onClick={() => act({ action: "submit", evidenceLink: link.trim() || null, evidenceNote: note.trim() || null })}
          >
            {busy ? "Submitting..." : "Submit for review"}
          </Button>
        </div>
      )}
      {isOwner && item.status === "SUBMITTED" && (
        <p className="text-xs text-muted-foreground">Waiting for your reviewer to check this.</p>
      )}

      {/* Reviewer controls */}
      {canReview && item.status === "SUBMITTED" && (
        <div className="space-y-2 border-t pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Comment (required to send back)</Label>
            <textarea
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What should be improved?"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => act({ action: "verify", reviewComment: comment.trim() || null })}>
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !comment.trim()}
              className="text-destructive hover:bg-destructive/5 border-destructive/30"
              onClick={() => act({ action: "rework", reviewComment: comment.trim() })}
            >
              Send back
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
