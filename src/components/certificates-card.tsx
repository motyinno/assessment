"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
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

interface CertificateRow {
  id: string;
  code: string;
  verifyUrl: string;
  createdAt: string;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString();
}

export function CertificatesCard() {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [addError, setAddError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<CertificateRow | null>(null);
  const [removing, setRemoving] = useState(false);

  function openAdd(open: boolean) {
    setAdding(open);
    setAddError("");
    if (open) setNewCode("");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/users/me/certificates");
    if (!res.ok) {
      setError("Failed to load certificates");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setCertificates(data.certificates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAddError("");
    const res = await fetch("/api/users/me/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: newCode.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAddError(d?.error?.message || "Failed to add certificate");
      return;
    }
    setAdding(false);
    setNewCode("");
    load();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const res = await fetch(`/api/users/me/certificates/${removeTarget.id}`, {
      method: "DELETE",
    });
    setRemoving(false);
    if (res.ok) {
      setRemoveTarget(null);
      load();
    } else {
      setError("Failed to remove certificate");
      setRemoveTarget(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Certificates</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Add certificates by their code. Each links to a public page where its
            validity can be verified.
          </p>
        </div>
        <Button onClick={() => openAdd(true)}>Add certificate</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No certificates yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Added</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>
                    <a
                      href={c.verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Verify
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </TableCell>
                  <TableCell>{fmtDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTarget(c)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </CardContent>

      {/* Add dialog */}
      <Dialog open={adding} onOpenChange={openAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add certificate</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Certificate code</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g. 5Y0FT4E8X7GG9F6T"
                className="font-mono"
                required
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Verifiable at https://cert.inno.ws/verify/&lt;code&gt;
              </p>
            </div>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => openAdd(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !newCode.trim()}>
                {submitting ? "Adding..." : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation dialog */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && !removing && setRemoveTarget(null)}
      >
        <DialogContent showCloseButton={!removing}>
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Remove certificate?</DialogTitle>
            <DialogDescription>
              This removes the certificate from your profile. Its public
              verification page is unaffected, and you can add it again later.
            </DialogDescription>
          </DialogHeader>
          {removeTarget && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
              {removeTarget.code}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={removing}
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing}
              onClick={confirmRemove}
            >
              {removing ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
