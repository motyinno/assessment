"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { baseGrade, gradeLabel } from "@/lib/grades";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  project: string | null;
  manager: string | null;
}

interface TechTopic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}
interface TechSection {
  id: string;
  title: string;
  topics: TechTopic[];
}
interface TechMatrix {
  sections: TechSection[];
}

export default function GeneratePdpForUserPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<UserInfo | null>(null);
  const [matrix, setMatrix] = useState<TechMatrix | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: only assessor/admin
  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ASSESSOR" && role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/users/${userId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/tech-matrix").then((r) => r.json()),
    ]).then(([u, m]) => {
      setUser(u);
      setMatrix(m);
    });
  }, [userId]);

  const base = user?.grade ? baseGrade(user.grade) : null;

  // Filter sections/topics to those that have content for this user's base grade
  const filtered = useMemo(() => {
    if (!matrix || !base) return [];
    return matrix.sections
      .map((s) => ({
        ...s,
        topics: s.topics.filter((t) => (t[base] as string[] | undefined)?.length),
      }))
      .filter((s) => s.topics.length > 0);
  }, [matrix, base]);

  // Default: preselect every visible topic once the matrix loads
  useEffect(() => {
    if (selected.size === 0 && filtered.length > 0) {
      const next = new Set<string>();
      for (const s of filtered) for (const t of s.topics) next.add(t.id);
      setSelected(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  function toggleTopic(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSection(sectionId: string, topicIds: string[]) {
    const allOn = topicIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) topicIds.forEach((id) => next.delete(id));
      else topicIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/users/${userId}/generate-pdp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка генерации");
      }
      // Generation runs in the background — go straight to the user's page
      // where the new PDP shows with a "Генерация..." indicator.
      router.push(`/users/${userId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setGenerating(false);
    }
  }

  if (!user || !matrix) {
    return <p className="text-muted-foreground">Загрузка...</p>;
  }

  if (!user.grade) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Сгенерировать ИПР</h1>
        <Card>
          <CardContent className="py-6">
            <p className="text-sm">
              У пользователя <b>{user.name}</b> не указан грейд. Назначьте грейд
              в карточке пользователя перед генерацией.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Сгенерировать ИПР</h1>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <span>{user.name}</span>
          <Badge variant="outline">{gradeLabel(user.grade)}</Badge>
          <span>·</span>
          <span>{user.email}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Темы тех. матрицы ({selected.size} выбрано)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.map((section) => {
            const ids = section.topics.map((t) => t.id);
            const allOn = ids.every((id) => selected.has(id));
            const someOn = ids.some((id) => selected.has(id));
            const isCollapsed = collapsed.has(section.id);
            return (
              <div key={section.id} className="border rounded-md">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(section.id)}
                    className="text-muted-foreground text-xs w-4"
                    style={{
                      transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)",
                    }}
                  >
                    ▼
                  </button>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOn && someOn;
                    }}
                    onChange={() => toggleSection(section.id, ids)}
                  />
                  <span className="text-sm font-medium">{section.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {section.topics.filter((t) => selected.has(t.id)).length}/
                    {section.topics.length}
                  </span>
                </div>
                {!isCollapsed && (
                  <div className="divide-y">
                    {section.topics.map((topic) => (
                      <label
                        key={topic.id}
                        className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selected.has(topic.id)}
                          onChange={() => toggleTopic(topic.id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{topic.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {(topic[base!] as string[]).join(" · ")}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={generating || selected.size === 0}>
          {generating ? "Генерация..." : "Сгенерировать ИПР"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/users")}>
          Отмена
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
