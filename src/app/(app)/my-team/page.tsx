import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
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
import { gradeLabel } from "@/lib/grades";
import { UserAvatar } from "@/components/user-avatar";

const PAGE_SIZE = 25;

export default async function MyTeamPage({
  searchParams,
}: {
  searchParams?: { archived?: string; page?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // My Team is now MANAGER-only — admins manage the directory through /users.
  if (session.user.role !== "MANAGER") redirect("/dashboard");

  const showArchived = searchParams?.archived === "include";
  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);

  const where = {
    managerId: session.user.id,
    isArchived: showArchived ? undefined : false,
  };

  // Paginated (S08): a manager's headcount is unbounded post-HRM-sync, so this
  // no longer loads every direct report into one unpaginated page.
  const [reports, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        grade: true,
        project: true,
        role: true,
        isArchived: true,
        photoFileName: true,
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  const archivedToggleHref = showArchived
    ? "/my-team"
    : "/my-team?archived=include";
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (showArchived) params.set("archived", "include");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/my-team?${qs}` : "/my-team";
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Team</h1>
          <p className="page-subtitle mt-1">
            Direct reports:{" "}
            <span className="font-medium text-foreground">{total}</span>
          </p>
        </div>
        <Link
          href={archivedToggleHref}
          className="text-sm text-primary hover:underline"
        >
          {showArchived ? "Скрыть архив" : "Показать архив"}
        </Link>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-sm font-medium">No direct reports yet</p>
            <p className="text-xs text-muted-foreground">
              Users will appear here once their manager is set to you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Roadmap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow
                    key={report.id}
                    className={"cursor-pointer" + (report.isArchived ? " opacity-60" : "")}
                  >
                    <TableCell>
                      <Link
                        href={`/users/${report.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <UserAvatar user={report} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                            {report.name}
                            {report.isArchived && (
                              <Badge variant="outline">Архив</Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {report.email}
                          </p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {report.grade ? (
                        <Badge variant="outline">{gradeLabel(report.grade)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {report.project || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/users/${report.id}/roadmap`}
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={pageHref(Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={
                "text-sm rounded-md border px-3 py-1.5 " +
                (page <= 1
                  ? "pointer-events-none opacity-50 text-muted-foreground"
                  : "text-foreground hover:bg-muted/50")
              }
            >
              Previous
            </Link>
            <span className="text-xs text-muted-foreground">
              Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <Link
              href={pageHref(page + 1)}
              aria-disabled={page * PAGE_SIZE >= total}
              className={
                "text-sm rounded-md border px-3 py-1.5 " +
                (page * PAGE_SIZE >= total
                  ? "pointer-events-none opacity-50 text-muted-foreground"
                  : "text-foreground hover:bg-muted/50")
              }
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
