"use client";

import { useEffect, useState } from "react";
import { ExternalLink, BadgeCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CertDetails {
  status: string;
  employeeName: string | null;
  division: string | null;
  category: string | null;
  dateIssued: string | null;
  expirationDate: string | null;
  issuedBy: string | null;
}

interface CertificateRow {
  id: string;
  code: string;
  verifyUrl: string;
  createdAt: string;
  status: "valid" | "not_found" | "unavailable";
  details: CertDetails | null;
}

function fmtDate(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

const STATUS_META = {
  valid: {
    label: "Valid",
    icon: BadgeCheck,
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  not_found: {
    label: "Not found",
    icon: ShieldAlert,
    className: "bg-destructive/15 text-destructive",
  },
  unavailable: {
    label: "Unverified",
    icon: ShieldQuestion,
    className: "bg-muted text-muted-foreground",
  },
} as const;

/**
 * Read-only list of a user's certificates, each checked live against the
 * public registry so the viewer sees current validity and details. Anyone can
 * view any user's certificates.
 */
export function UserCertificatesCard({ userId }: { userId: string }) {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/users/${userId}/certificates`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (active) setCertificates(data.certificates ?? []);
      })
      .catch(() => active && setError("Failed to load certificates"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificates</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Pinned certificates, verified live against the public registry.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading certificates...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No certificates.</p>
        ) : (
          <ul className="space-y-3">
            {certificates.map((c) => {
              const meta = STATUS_META[c.status];
              const Icon = meta.icon;
              const issued = fmtDate(c.details?.dateIssued ?? null);
              const expires = fmtDate(c.details?.expirationDate ?? null);
              return (
                <li
                  key={c.id}
                  className="rounded-lg border bg-card p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          meta.className
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                      <span className="font-medium text-sm">
                        {c.details?.category ?? "Certificate"}
                      </span>
                    </div>
                    <a
                      href={c.verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Verify
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{c.code}</span>
                    {c.details?.division && <span>Division: {c.details.division}</span>}
                    {issued && <span>Issued: {issued}</span>}
                    {expires && <span>Expires: {expires}</span>}
                    {c.details?.issuedBy && <span>By: {c.details.issuedBy}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
