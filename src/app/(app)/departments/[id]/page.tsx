import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManagePeople } from "@/lib/roles";
import { getDepartmentCard } from "@/lib/departments";
import { MULTI_MEMBERSHIP_NOTE } from "@/lib/departments-copy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function PersonRow({
  user,
}: {
  user: { id: string; name: string; jobTitle: string | null; photoFileName: string | null };
}) {
  return (
    <div className="flex items-center gap-3">
      <UserAvatar user={user} size="sm" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
        {user.jobTitle && <p className="text-xs text-muted-foreground truncate">{user.jobTitle}</p>}
      </div>
    </div>
  );
}

export default async function DepartmentCardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { page?: string; archived?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canManageArchive = canManagePeople(session.user.role);
  const includeArchived = searchParams?.archived === "include" && canManageArchive;
  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);

  const card = await getDepartmentCard(params.id, {
    includeArchived,
    page,
    pageSize: PAGE_SIZE,
  });
  if (!card) notFound();

  const { department, breadcrumbs, head, deputy, children, members } = card;
  const totalPages = Math.max(1, Math.ceil(members.total / members.pageSize));

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (includeArchived) qs.set("archived", "include");
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/departments/${department.id}?${s}` : `/departments/${department.id}`;
  };
  const archivedToggleHref = includeArchived
    ? `/departments/${department.id}`
    : `/departments/${department.id}?archived=include`;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/departments" className="hover:text-foreground hover:underline">
          Departments
        </Link>
        {breadcrumbs.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            {i === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{b.name}</span>
            ) : (
              <Link href={`/departments/${b.id}`} className="hover:text-foreground hover:underline">
                {b.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            {department.name}
            {department.typeName && <Badge variant="outline">{department.typeName}</Badge>}
          </h1>
          <p className="page-subtitle mt-1">
            {department.memberCount} in unit · {department.memberCountWithDescendants} including sub-units
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageArchive && (
            <Link href={archivedToggleHref} className="text-sm text-primary hover:underline">
              {includeArchived ? "Hide archive" : "Show archive"}
            </Link>
          )}
          <Link
            href={`/users?department=${department.id}&includeDescendants=1`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            All people in unit
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{MULTI_MEMBERSHIP_NOTE}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Head</CardTitle>
          </CardHeader>
          <CardContent>
            {head ? <PersonRow user={head} /> : <span className="text-sm text-muted-foreground">—</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Deputy</CardTitle>
          </CardHeader>
          <CardContent>
            {deputy ? <PersonRow user={deputy} /> : <span className="text-sm text-muted-foreground">—</span>}
          </CardContent>
        </Card>
      </div>

      {children.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Sub-units</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {children.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/departments/${c.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-accent/40"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-medium text-foreground">{c.name}</span>
                      {c.typeName && <Badge variant="outline">{c.typeName}</Badge>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {c.memberCount} / {c.memberCountWithDescendants}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 py-3">
          <CardTitle className="text-sm">Members</CardTitle>
          <span className="text-xs text-muted-foreground">{members.total}</span>
        </CardHeader>
        {members.items.length === 0 ? (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No members in this unit.
          </CardContent>
        ) : (
          <>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.items.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/users/${m.id}`} className="flex items-center gap-3 group">
                          <UserAvatar user={m} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                              {m.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.jobTitle || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * members.pageSize + 1}–{Math.min(page * members.pageSize, members.total)} of{" "}
                {members.total}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={pageHref(Math.max(1, page - 1))}
                  aria-disabled={page <= 1}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    page <= 1 && "pointer-events-none opacity-50"
                  )}
                >
                  Previous
                </Link>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Link
                  href={pageHref(page + 1)}
                  aria-disabled={page >= totalPages}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    page >= totalPages && "pointer-events-none opacity-50"
                  )}
                >
                  Next
                </Link>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
