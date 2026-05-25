"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function statusOf(t: TokenRow): { label: string; variant: "default" | "secondary" | "destructive" | "warning" } {
  if (t.revokedAt) return { label: "Revoked", variant: "destructive" };
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now())
    return { label: "Expired", variant: "secondary" };
  return { label: "Active", variant: "default" };
}

export function ApiTokensCard() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newExpiresDays, setNewExpiresDays] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/users/me/tokens");
    if (!res.ok) {
      setError("Failed to load tokens");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTokens(data.tokens ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const body: Record<string, unknown> = { name: newName.trim() };
    const days = Number(newExpiresDays);
    if (newExpiresDays && Number.isFinite(days) && days > 0) {
      body.expiresInDays = days;
    }
    const res = await fetch("/api/users/me/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error?.message || "Failed to create token");
      return;
    }
    const data = await res.json();
    setIssuedToken(data.token);
    setCreating(false);
    setNewName("");
    setNewExpiresDays("");
    load();
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this token? Any integration using it will stop working.")) return;
    const res = await fetch(`/api/users/me/tokens/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function copyIssued() {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>API tokens</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Personal access tokens for programmatic API access. Inherit your role and permissions.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Create token</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => {
                const s = statusOf(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.tokenPrefix}…</TableCell>
                    <TableCell>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </TableCell>
                    <TableCell>{fmtDate(t.lastUsedAt)}</TableCell>
                    <TableCell>{t.expiresAt ? fmtDate(t.expiresAt) : "Never"}</TableCell>
                    <TableCell>{fmtDate(t.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {!t.revokedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(t.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API token</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. integration-bot"
                required
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expires in days (optional)</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={newExpiresDays}
                onChange={(e) => setNewExpiresDays(e.target.value)}
                placeholder="Leave empty for no expiration"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !newName.trim()}>
                {submitting ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Show-once dialog */}
      <Dialog open={!!issuedToken} onOpenChange={(o) => !o && setIssuedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API token</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Copy this token now. <strong>You won&apos;t be able to see it again.</strong>
            </p>
            <div className="flex items-stretch gap-2">
              <Input
                readOnly
                value={issuedToken ?? ""}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" onClick={copyIssued}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use as:{" "}
              <code className="font-mono">Authorization: Bearer {issuedToken?.slice(0, 14)}…</code>
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssuedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
