"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type NoCorpEmailIssue = { id: string; hrmEmployeeId: number | null; email: string | null; message: string };
type NotInHrmUser = { id: string; name: string; email: string; createdAt: string };
type NoGradeUser = { id: string; name: string; email: string; jobTitle: string | null };
type GradeUnmappedIssue = { id: string; hrmEmployeeId: number | null; email: string | null; message: string };
type UnresolvedIssue = { id: string; kind: string; hrmEmployeeId: number | null; email: string | null; message: string };
type RoleGrant = {
  userId: string;
  name: string;
  previousRole: string;
  newRole: string;
  hrmField: string | null;
  createdAt: string;
};

type IssuesResponse = {
  run: { id: string; startedAt: string; status: string } | null;
  noCorpEmail: NoCorpEmailIssue[];
  notInHrm: NotInHrmUser[];
  noGrade: NoGradeUser[];
  gradeUnmapped: GradeUnmappedIssue[];
  unresolved: UnresolvedIssue[];
  roleGrants: RoleGrant[];
};

const EMPTY: IssuesResponse = {
  run: null,
  noCorpEmail: [],
  notInHrm: [],
  noGrade: [],
  gradeUnmapped: [],
  unresolved: [],
  roleGrants: [],
};

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
        <span>{title}</span>
        <Badge variant="secondary">{count}</Badge>
      </summary>
      <div className="border-t border-border px-4 py-3">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">No records</p>
        ) : (
          children
        )}
      </div>
    </details>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      {children}
    </div>
  );
}

export function HrmSyncIssues() {
  const [data, setData] = useState<IssuesResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/hrm/sync/issues?runId=latest", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!data.run) {
    return <p className="text-sm text-muted-foreground">No runs yet</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          From the latest run ({new Date(data.run.startedAt).toLocaleString()})
        </p>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        <Section title="HRM employees without a corporate email" count={data.noCorpEmail.length}>
          {data.noCorpEmail.map((i) => (
            <Row key={i.id}>
              <span>{i.email ?? `employee #${i.hrmEmployeeId}`}</span>
              <span className="text-muted-foreground">{i.message}</span>
            </Row>
          ))}
        </Section>

        <Section title="Local users not in HRM" count={data.notInHrm.length}>
          {data.notInHrm.map((u) => (
            <Row key={u.id}>
              <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                {u.name}
              </Link>
              <span className="text-muted-foreground">{u.email}</span>
            </Row>
          ))}
        </Section>

        <Section title="People without a grade" count={data.noGrade.length + data.gradeUnmapped.length}>
          {data.noGrade.map((u) => (
            <Row key={u.id}>
              <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                {u.name}
              </Link>
              <span className="text-muted-foreground">{u.jobTitle ?? u.email}</span>
            </Row>
          ))}
          {data.gradeUnmapped.map((i) => (
            <Row key={i.id}>
              <span>{i.email ?? `employee #${i.hrmEmployeeId}`}</span>
              <span className="text-muted-foreground">{i.message}</span>
            </Row>
          ))}
        </Section>

        <Section title="Auto-granted roles log" count={data.roleGrants.length}>
          {data.roleGrants.map((r, idx) => (
            <Row key={`${r.userId}-${idx}`}>
              <Link href={`/users/${r.userId}`} className="font-medium hover:underline">
                {r.name}
              </Link>
              <span className="text-muted-foreground">
                {r.previousRole} → {r.newRole} · {r.hrmField ?? "—"} ·{" "}
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </Row>
          ))}
        </Section>

        <Section title="Unresolved links" count={data.unresolved.length} defaultOpen={false}>
          {data.unresolved.map((i) => (
            <Row key={i.id}>
              <span>{i.kind}</span>
              <span className="text-muted-foreground">{i.message}</span>
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}
