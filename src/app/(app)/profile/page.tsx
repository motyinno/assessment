"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADE_VALUES, gradeLabel } from "@/lib/grades";
import { ManagerCombobox } from "@/components/manager-combobox";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { CertificatesCard } from "@/components/certificates-card";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  ASSESSOR: "Assessor",
  USER: "User",
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  grade?: string | null;
  project?: string | null;
  managerId?: string | null;
}

type UserOption = Pick<UserRecord, "id" | "name" | "email" | "role">;

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [form, setForm] = useState<{
    name: string;
    grade: string;
    project: string;
    managerId: string | null;
  }>({
    name: "",
    grade: "",
    project: "",
    managerId: null,
  });
  const [users, setUsers] = useState<UserOption[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/users`)
      .then((r) => r.json())
      .then((all: UserRecord[]) => {
        setUsers(
          all.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))
        );
        const me = all.find((u) => u.id === session.user.id);
        if (me) {
          setForm({
            name: me.name || "",
            grade: me.grade || "",
            project: me.project || "",
            managerId: me.managerId ?? null,
          });
        }
        setLoading(false);
      });
  }, [session]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);

    const data: Record<string, unknown> = {
      name: form.name,
      grade: form.grade,
      project: form.project,
      managerId: form.managerId,
    };

    const res = await fetch(`/api/users/${session!.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setMessage("Profile updated");
      update();
    } else {
      const d = await res.json();
      setError(apiErrorMessage(d, "Failed to save"));
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const email = session?.user?.email ?? "";
  const role = (session?.user as { role?: string } | undefined)?.role ?? "USER";
  const initials = initialsOf(form.name || "?");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle mt-1">
          Your personal information and preferences
        </p>
      </div>

      {/* Identity banner */}
      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 text-primary flex items-center justify-center text-lg font-semibold ring-1 ring-primary/20 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {form.name || "—"}
            </h2>
            <p className="text-sm text-muted-foreground truncate">{email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge
                variant={
                  role === "ADMIN"
                    ? "warning"
                    : role === "MANAGER"
                      ? "info"
                      : role === "ASSESSOR"
                        ? "default"
                        : "secondary"
                }
              >
                {ROLE_LABEL[role] || role}
              </Badge>
              {form.grade && (
                <Badge variant="outline">{gradeLabel(form.grade)}</Badge>
              )}
              {form.project && (
                <Badge variant="secondary">{form.project}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={email}
                  disabled
                  readOnly
                  className="h-10"
                />
                <p className="text-[11px] text-muted-foreground">
                  Email is managed via Google SSO
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Grade</Label>
                {role === "ADMIN" ? (
                  <Select
                    value={form.grade}
                    onValueChange={(v) => v && setForm({ ...form, grade: v })}
                  >
                    <SelectTrigger className="!h-10 w-full">
                      <SelectValue placeholder="Select grade">
                        {(v: unknown) =>
                          typeof v === "string" && v ? gradeLabel(v) : "Select grade"
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
                ) : (
                  <>
                    <Input
                      value={form.grade ? gradeLabel(form.grade) : ""}
                      disabled
                      readOnly
                      placeholder="No grade assigned"
                      className="h-10"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Grade is assigned by an administrator
                    </p>
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Input
                  value={form.project}
                  onChange={(e) =>
                    setForm({ ...form, project: e.target.value })
                  }
                  placeholder="e.g. Innowise Core"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Manager</Label>
                <ManagerCombobox
                  value={form.managerId}
                  onChange={(id) => setForm({ ...form, managerId: id })}
                  options={users}
                  excludeId={session?.user?.id}
                />
                <p className="text-[11px] text-muted-foreground">
                  Pick from Manager / Admin users.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t">
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
              {message && (
                <span className="text-sm text-success inline-flex items-center gap-1">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {message}
                </span>
              )}
              {error && (
                <span className="text-sm text-destructive">{error}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <CertificatesCard />

      <ApiTokensCard />
    </div>
  );
}
