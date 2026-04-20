"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Participant {
  userId: string;
  userName: string;
  participantRole: "SUBJECT" | "ASSESSOR";
  assignedSections?: string[];
}

export default function NewAssessmentPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [form, setForm] = useState({
    title: "",
    grade: "jun",
    scheduledAt: "",
    notes: "",
  });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<"SUBJECT" | "ASSESSOR">("SUBJECT");
  const [error, setError] = useState("");

  useEffect(() => {
    const role = session?.user?.role;
    if (role !== "ASSESSOR") {
      router.push("/dashboard");
      return;
    }
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers);
  }, [session, router]);

  function addParticipant() {
    if (!selectedUser) return;
    const user = users.find((u) => u.id === selectedUser);
    if (!user) return;

    // Don't add duplicates
    const exists = participants.find(
      (p) => p.userId === selectedUser && p.participantRole === selectedRole
    );
    if (exists) return;

    setParticipants([
      ...participants,
      {
        userId: user.id,
        userName: user.name,
        participantRole: selectedRole,
      },
    ]);
    setSelectedUser("");
  }

  function removeParticipant(idx: number) {
    setParticipants(participants.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        participants: participants.map((p) => ({
          userId: p.userId,
          participantRole: p.participantRole,
          assignedSections: p.assignedSections,
        })),
      }),
    });

    if (res.ok) {
      const assessment = await res.json();
      router.push(`/assessments/${assessment.id}`);
    } else {
      const data = await res.json();
      setError(data.error || "Ошибка создания");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Новый ассессмент</h1>
        <p className="text-muted-foreground">
          Создайте ассессмент и назначьте участников
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Основная информация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Например: Ассессмент Node.js Q2 2026"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Грейд</Label>
                <Select
                  value={form.grade}
                  onValueChange={(v) => v && setForm({ ...form, grade: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jun">Junior</SelectItem>
                    <SelectItem value="mid">Middle</SelectItem>
                    <SelectItem value="sen">Senior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Запланированная дата</Label>
                <Input
                  type="date"
                  value={form.scheduledAt}
                  onChange={(e) =>
                    setForm({ ...form, scheduledAt: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Заметки</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Дополнительные комментарии"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Участники</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedUser} onValueChange={(v) => v && setSelectedUser(v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Выберите пользователя" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedRole}
                onValueChange={(v) =>
                  v && setSelectedRole(v as "SUBJECT" | "ASSESSOR")
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUBJECT">Оцениваемый</SelectItem>
                  <SelectItem value="ASSESSOR">Асессор</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addParticipant}>
                Добавить
              </Button>
            </div>

            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Добавьте участников ассессмента
              </p>
            ) : (
              <div className="space-y-2">
                {participants.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.userName}</span>
                      <Badge
                        variant={
                          p.participantRole === "ASSESSOR"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {p.participantRole === "ASSESSOR"
                          ? "Асессор"
                          : "Оцениваемый"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParticipant(i)}
                    >
                      Удалить
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit">Создать ассессмент</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
