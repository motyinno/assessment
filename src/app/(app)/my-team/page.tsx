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

function userInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function MyTeamPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // My Team is now MANAGER-only — admins manage the directory through /users.
  if (session.user.role !== "MANAGER") redirect("/dashboard");

  const reports = await prisma.user.findMany({
    where: { managerId: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      grade: true,
      project: true,
      role: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Team</h1>
          <p className="page-subtitle mt-1">
            Direct reports:{" "}
            <span className="font-medium text-foreground">{reports.length}</span>
          </p>
        </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/users/${report.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-muted to-muted text-muted-foreground flex items-center justify-center text-[11px] font-semibold ring-1 ring-border/50">
                          {userInitials(report.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {report.name}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
