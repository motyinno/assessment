"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
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
import { canManagePeople } from "@/lib/roles";
import { UserAvatar } from "@/components/user-avatar";

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
  photoFileName: string | null;
  createdAt: string;
  isArchived: boolean;
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

const PAGE_SIZE = 25;

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
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
  const [showArchived, setShowArchived] = useState(false);

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";
  const canViewUsers = isAdmin || role === "MANAGER";
  const canToggleArchived = canManagePeople(role ?? "");

  // Debounced server-side search (S08): the directory can be thousands of
  // rows, so filtering happens on the server instead of in the browser.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change starts back at page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, showArchived]);

  useEffect(() => {
    if (status === "loading") return;
    if (!canViewUsers) {
      router.push("/dashboard");
      return;
    }
    const controller = new AbortController();
    fetchUsers(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canViewUsers, router, showArchived, roleFilter, debouncedSearch, page]);

  async function fetchUsers(signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (roleFilter !== "ALL") params.set("role", roleFilter);
    if (showArchived && canToggleArchived) params.set("archived", "include");
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    setFetching(true);
    try {
      const res = await fetch(`/api/users?${params.toString()}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items);
        setTotal(data.total);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
    } finally {
      setFetching(false);
    }
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
      setError(apiErrorMessage(data, "Failed to create user"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle mt-1">
            Total: <span className="font-medium text-foreground">{total}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canToggleArchived && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Скрыть архив" : "Показать архив"}
            </Button>
          )}
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
      </div>

      {/* Role filter chips (S08: server-side, no per-chip counts — that would
          mean a separate query per role on every keystroke). */}
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "ADMIN", "MANAGER", "ASSESSOR", "USER"] as const).map((r) => {
          const active = roleFilter === r;
          const label = r === "ALL" ? "All" : ROLE_META[r]?.label ?? r;
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

      {/* User table — server-paginated (S08): `users` is already just this page. */}
      {users.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <p className="text-sm font-medium">
              {fetching ? "Loading…" : "No users found"}
            </p>
            {!fetching && (
              <p className="text-xs text-muted-foreground">Try adjusting the filter or search.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className={fetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
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
                  {users.map((user) => {
                    const meta = ROLE_META[user.role] ?? ROLE_META.USER;
                    return (
                      <TableRow
                        key={user.id}
                        className={"cursor-pointer" + (user.isArchived ? " opacity-60" : "")}
                        onClick={() => router.push(`/users/${user.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar user={user} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                                {user.name}
                                {user.isArchived && (
                                  <Badge variant="outline">Архив</Badge>
                                )}
                              </p>
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

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || fetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page * PAGE_SIZE >= total || fetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
