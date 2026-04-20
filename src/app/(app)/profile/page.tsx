"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [form, setForm] = useState({
    name: "",
    grade: "",
    project: "",
    manager: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/users`)
      .then((r) => r.json())
      .then((users) => {
        const me = users.find((u: { id: string }) => u.id === session.user.id);
        if (me) {
          setForm({
            name: me.name || "",
            grade: me.grade || "",
            project: me.project || "",
            manager: me.manager || "",
          });
        }
        setLoading(false);
      });
  }, [session]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    const data: Record<string, string> = {
      name: form.name,
      grade: form.grade,
      project: form.project,
      manager: form.manager,
    };

    const res = await fetch(`/api/users/${session!.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setMessage("Профиль обновлён");
      update();
    } else {
      const d = await res.json();
      setError(d.error || "Ошибка сохранения");
    }
  }

  if (loading) return <p className="text-muted-foreground">Загрузка...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Профиль</h1>
        <p className="text-muted-foreground">Настройки вашего профиля</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Личные данные</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Имя</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Грейд</Label>
              <Select
                value={form.grade}
                onValueChange={(v) => v && setForm({ ...form, grade: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите грейд" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jun">Junior</SelectItem>
                  <SelectItem value="mid">Middle</SelectItem>
                  <SelectItem value="sen">Senior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Проект</Label>
              <Input
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Руководитель</Label>
              <Input
                value={form.manager}
                onChange={(e) => setForm({ ...form, manager: e.target.value })}
              />
            </div>
            {message && <p className="text-sm text-green-600">{message}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit">Сохранить</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
