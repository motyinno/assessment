"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADE_VALUES, gradeLabel } from "@/lib/grades";
import { ManagerCombobox } from "@/components/manager-combobox";

interface ManagerRef {
  id: string;
  name: string;
  email: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  grade: string | null;
  project: string | null;
  managerId: string | null;
  manager: ManagerRef | null;
  createdAt: string;
}

const ROLE_META: Record<
  string,
  { label: string; tone: "warning" | "default" | "secondary" | "info"; accent: string }
> = {
  ADMIN: { label: "Admin", tone: "warning", accent: "from-warning/30 to-warning/10 text-warning-foreground" },
  MANAGER: { label: "Manager", tone: "info", accent: "from-info/25 to-info/5 text-info" },
  ASSESSOR: { label: "Assessor", tone: "default", accent: "from-primary/25 to-primary/5 text-primary" },
  USER: { label: "User", tone: "secondary", accent: "from-muted to-muted text-muted-foreground" },
};

function userInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "ALL" | "ADMIN" | "MANAGER" | "ASSESSOR" | "USER"
  >("ALL");
  const [form, setForm] = useState<{
    name: string;
    email: string;
    role: string;
    grade: string;
    project: string;
    managerId: string | null;
  }>({
    name: "",
    email: "",
    role: "USER",
    grade: "",
    project: "",
    managerId: null,
  });
  const [error, setError] = useState("");

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";
  const canViewUsers = isAdmin || role === "MANAGER";

  useEffect(() => {
    if (status === "loading") return;
    if (!canViewUsers) {
      router.push("/dashboard");
      return;
    }
    fetchUsers();
  }, [status, canViewUsers, router]);

  async function fetchUsers() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setOpen(false);
      setForm({ name: "", email: "", role: "USER", grade: "", project: "", managerId: null });
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create user");
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle mt-1">
            Total: <span className="font-medium text-foreground">{users.length}</span>
          </p>
        </div>
        {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            Create user
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="name.surname@innowise.com"
                  pattern=".+@innowise\.com$"
                  title="Only @innowise.com corporate emails"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Only @innowise.com corporate emails
                </p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => v && setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ASSESSOR">Assessor</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Grade</Label>
                  <Select value={form.grade} onValueChange={(v) => v && setForm({ ...form, grade: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select">
                        {(v: unknown) =>
                          typeof v === "string" && v ? gradeLabel(v) : "Select"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_VALUES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {gradeLabel(g)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Input
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Manager</Label>
                <ManagerCombobox
                  value={form.managerId}
                  onChange={(id) => setForm({ ...form, managerId: id })}
                  options={users.map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                  }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Only Manager / Admin users can be picked.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Role filter chips with counts */}
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "ADMIN", "MANAGER", "ASSESSOR", "USER"] as const).map((r) => {
          const count =
            r === "ALL" ? users.length : users.filter((u) => u.role === r).length;
          const active = roleFilter === r;
          const label =
            r === "ALL" ? "All" : ROLE_META[r]?.label ?? r;
          return (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all " +
                (active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground ring-1 ring-border hover:ring-primary/30")
              }
            >
              {label}
              <span
                className={
                  "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold " +
                  (active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")
                }
              >
                {count}
              </span>
            </button>
          );
        })}
        <div className="ml-auto w-full sm:w-64">
          <div className="relative">
            <svg
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* User table */}
      {(() => {
        const filtered = users.filter((u) => {
          if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
          if (!search) return true;
          const q = search.toLowerCase();
          return (
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.project ?? "").toLowerCase().includes(q)
          );
        });

        if (filtered.length === 0) {
          return (
            <Card>
              <CardContent className="py-14 flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <p className="text-sm font-medium">No users found</p>
                <p className="text-xs text-muted-foreground">Try adjusting the filter or search.</p>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Manager</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => {
                    const meta = ROLE_META[user.role] ?? ROLE_META.USER;
                    return (
                      <TableRow
                        key={user.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/users/${user.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 shrink-0 rounded-full bg-gradient-to-br ${meta.accent} flex items-center justify-center text-[11px] font-semibold ring-1 ring-border/50`}
                            >
                              {userInitials(user.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.tone}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {user.grade ? (
                            <Badge variant="outline">{gradeLabel(user.grade)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.project || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.manager?.name || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
