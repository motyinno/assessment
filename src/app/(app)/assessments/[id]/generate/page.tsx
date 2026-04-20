"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TopicWithSelection {
  name: string;
  score: number | null;
  subtopics: string[];
  comment: string;
  selected: boolean;
}

interface SubjectUser {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  project: string | null;
  manager: string | null;
}

export default function GeneratePdpPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [assessment, setAssessment] = useState<{
    title: string;
    grade: string;
    aiFeedback: string | null;
  } | null>(null);
  const [subject, setSubject] = useState<SubjectUser | null>(null);
  const [topics, setTopics] = useState<TopicWithSelection[]>([]);
  const [settings, setSettings] = useState({
    maxQuestions: 2,
    threshold: 5,
    includeTasks: true,
    useAI: false,
  });
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const [assessmentRes, resultsRes] = await Promise.all([
      fetch(`/api/assessments/${id}`),
      fetch(`/api/assessments/${id}/results`),
    ]);

    if (assessmentRes.ok && resultsRes.ok) {
      const a = await assessmentRes.json();
      const results = await resultsRes.json();

      setAssessment({ title: a.title, grade: a.grade, aiFeedback: a.aiFeedback });

      const subjectUser = a.participants
        .filter((p: { participantRole: string }) => p.participantRole === "SUBJECT")
        .map((p: { user: SubjectUser }) => p.user)[0];
      setSubject(subjectUser || null);

      setTopics(
        results.map((r: { category: string; score: number | null; comment: string | null; subtopics: string | null }) => ({
          name: r.category,
          score: r.score,
          subtopics: r.subtopics ? JSON.parse(r.subtopics) : [],
          comment: r.comment || "",
          selected: r.score !== null && r.score < settings.threshold,
        }))
      );
    }
  }

  function applyThreshold(threshold: number) {
    setSettings((s) => ({ ...s, threshold }));
    setTopics((prev) =>
      prev.map((t) => ({
        ...t,
        selected: t.score !== null && t.score < threshold,
      }))
    );
  }

  function toggleTopic(idx: number) {
    setTopics((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t))
    );
  }

  async function handleGenerate() {
    if (!subject || !assessment) return;

    setGenerating(true);
    setMessage("");

    const selectedTopics = topics.filter((t) => t.selected);
    const outputName = `ИПР_${subject.name.replace(/\s+/g, "_")}.docx`;

    const body = {
      weakTopics: selectedTopics,
      info: {
        employee: subject.name,
        manager: subject.manager || "",
        grade: assessment.grade,
        date: new Date().toLocaleDateString("ru-RU"),
        level_before: { jun: "Junior", mid: "Middle", sen: "Senior" }[assessment.grade] || assessment.grade,
        next_date: "",
        project: subject.project || "",
        interviewer: session?.user?.name || "",
      },
      settings: {
        maxQuestions: settings.maxQuestions,
        threshold: settings.threshold,
        outputName,
        includeTasks: settings.includeTasks,
      },
      useAI: settings.useAI,
      assessmentId: id,
    };

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setMessage("Ошибка генерации");
        setGenerating(false);
        return;
      }

      const blob = await res.blob();

      // Save PDP record
      const formData = new FormData();
      formData.append("file", blob, outputName);
      formData.append("fileName", outputName);
      formData.append("userId", subject.id);
      formData.append("assessmentId", id);
      formData.append("topicsJson", JSON.stringify(selectedTopics.map((t) => t.name)));

      await fetch("/api/pdps", { method: "POST", body: formData });

      // Also download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputName;
      a.click();
      URL.revokeObjectURL(url);

      setMessage("ИПР сгенерирован и сохранён");
    } catch {
      setMessage("Ошибка генерации");
    }
    setGenerating(false);
  }

  if (!assessment)
    return <p className="text-muted-foreground">Загрузка...</p>;

  const selectedCount = topics.filter((t) => t.selected).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Генерация ИПР</h1>
        <p className="text-muted-foreground">{assessment.title}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Subject display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сотрудник</CardTitle>
          </CardHeader>
          <CardContent>
            {subject ? (
              <p className="text-sm font-medium">{subject.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Нет сотрудника</p>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Макс. вопросов на тему</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={settings.maxQuestions}
                onChange={(e) =>
                  setSettings({ ...settings, maxQuestions: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Порог оценки (ниже = в ИПР)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.threshold}
                onChange={(e) => applyThreshold(Number(e.target.value))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.includeTasks}
                onChange={(e) =>
                  setSettings({ ...settings, includeTasks: e.target.checked })
                }
              />
              Практические задания
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.useAI}
                  onChange={(e) =>
                    setSettings({ ...settings, useAI: e.target.checked })
                  }
                />
                Использовать AI вопросы и практические задания для PDP
              </label>
              <p className="text-xs text-muted-foreground">
                При выборе этой опции AI сгенерирует вопросы и задания на основе результатов оценки
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Выбрано тем</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {selectedCount} / {topics.length}
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTopics((prev) => prev.map((t) => ({ ...t, selected: true })))
                }
              >
                Все
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTopics((prev) =>
                    prev.map((t) => ({ ...t, selected: false }))
                  )
                }
              >
                Сбросить
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Topics */}
      <Card>
        <CardHeader>
          <CardTitle>Темы для ИПР</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {topics.map((t, i) => (
              <button
                key={i}
                onClick={() => toggleTopic(i)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm border transition-colors ${
                  t.selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}
              >
                {t.name}
                {t.score !== null && (
                  <Badge
                    variant={t.score >= 7 ? "secondary" : t.score >= 5 ? "outline" : "destructive"}
                    className="ml-1 text-xs"
                  >
                    {t.score}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button
          onClick={handleGenerate}
          disabled={generating || selectedCount === 0}
          size="lg"
        >
          {generating ? "Генерация..." : `Сгенерировать ИПР (${selectedCount} тем)`}
        </Button>
        <Button variant="outline" onClick={() => router.push(`/assessments/${id}`)}>
          Назад
        </Button>
        {message && (
          <p className={`text-sm ${message.includes("Ошибка") ? "text-destructive" : "text-green-600"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
