"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SESSION_TYPE_LABELS } from "@/lib/assessment-sessions";

interface ResultEntry {
  category: string;
  score: number | null;
  comment: string;
  subtopics: string[];
}

export default function ConductAssessmentPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const sessionId = searchParams.get("session");

  const [assessment, setAssessment] = useState<{
    title: string;
    grade: string;
    status: string;
  } | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [mappingKeys, setMappingKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [_matrixData, _setMatrixData] = useState(null); // kept for compat
  const [currentSession, setCurrentSession] = useState<{ id: string; type: string; durationMin: number } | null>(null);

  useEffect(() => {
    if (session?.user?.role !== "ASSESSOR" && session?.user?.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    loadData();
  }, [session, router, id]);

  async function loadData() {
    const [assessmentRes, resultsRes, dataRes] = await Promise.all([
      fetch(`/api/assessments/${id}`),
      fetch(`/api/assessments/${id}/results`),
      fetch("/api/data"),
    ]);

    // Load session info if sessionId is present
    if (sessionId) {
      const sessionsRes = await fetch(`/api/assessments/${id}/sessions`);
      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        const found = sessions.find((s: { id: string }) => s.id === sessionId);
        if (found) setCurrentSession({ id: found.id, type: found.type, durationMin: found.durationMin });
      }
    }

    if (assessmentRes.ok) {
      const a = await assessmentRes.json();
      setAssessment({ title: a.title, grade: a.grade, status: a.status });

      if (dataRes.ok) {
        const data = await dataRes.json();
        const keys = data.mappingKeys?.[a.grade] || [];
        setMappingKeys(keys);

        if (resultsRes.ok) {
          const existing = await resultsRes.json();
          if (existing.length > 0) {
            setResults(
              existing.map((r: { category: string; score: number | null; comment: string | null; subtopics: string | null }) => ({
                category: r.category,
                score: r.score,
                comment: r.comment || "",
                subtopics: r.subtopics ? JSON.parse(r.subtopics) : [],
              }))
            );
          } else {
            // Initialize from mapping keys
            setResults(
              keys.map((k: string) => ({
                category: k,
                score: null,
                comment: "",
                subtopics: [],
              }))
            );
          }
        }
      }
    }
  }

  function updateResult(idx: number, field: keyof ResultEntry, value: unknown) {
    setResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  async function handleExcelUpload(file: File) {
    setUploadError("");
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/parse-excel", { method: "POST", body: formData });
    if (!res.ok) {
      setUploadError("Ошибка разбора файла");
      return;
    }

    const data = await res.json();
    const categories = data.categories || [];

    setResults(
      categories.map((c: { name: string; score: number | null; comment: string; subtopics: string[] }) => ({
        category: c.name,
        score: c.score,
        comment: c.comment || "",
        subtopics: c.subtopics || [],
      }))
    );
    setMessage("Данные из Excel загружены. Нажмите «Сохранить» для сохранения.");
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".xlsx")) handleExcelUpload(file);
    },
    []
  );

  async function handleSave() {
    setSaving(true);
    setMessage("");

    const res = await fetch(`/api/assessments/${id}/results`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });

    setSaving(false);
    if (res.ok) {
      setMessage("Результаты сохранены");
    } else {
      setMessage("Ошибка сохранения");
    }
  }

  if (!assessment)
    return <p className="text-muted-foreground">Загрузка...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Проведение ассессмента</h1>
        <p className="text-muted-foreground">{assessment.title}</p>
      </div>

      {currentSession && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-3 flex items-center gap-3">
            <Badge variant="default" className="bg-blue-500">
              {SESSION_TYPE_LABELS[currentSession.type] || currentSession.type}
            </Badge>
            <span className="text-sm text-blue-700">
              Длительность: {currentSession.durationMin} мин.
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">Ввод вручную</TabsTrigger>
          <TabsTrigger value="excel">Загрузить Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="excel" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25"
                }`}
              >
                <p className="text-sm text-muted-foreground mb-2">
                  Перетащите файл Excel (.xlsx) сюда или
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".xlsx";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleExcelUpload(file);
                    };
                    input.click();
                  }}
                >
                  Выбрать файл
                </Button>
                {uploadError && (
                  <p className="text-sm text-destructive mt-2">{uploadError}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Оценки по категориям</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Категория</TableHead>
                    <TableHead className="w-24">Оценка (1-10)</TableHead>
                    <TableHead>Комментарий</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {r.category}
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={r.score ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                            const n = raw === "" ? null : Number(raw);
                            const clamped = n === null ? null : Math.min(Math.max(n, 0), 10);
                            updateResult(i, "score", clamped);
                          }}
                          className="w-20 text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.comment}
                          onChange={(e) =>
                            updateResult(i, "comment", e.target.value)
                          }
                          placeholder="Комментарий..."
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {results.length > 0 && (
        <div className="flex items-center gap-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить результаты"}
          </Button>
          {currentSession && (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={async () => {
                await handleSave();
                const res = await fetch(`/api/assessments/${id}/sessions`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: currentSession.id, status: "COMPLETED" }),
                });
                if (res.ok) {
                  router.push(`/assessments/${id}`);
                }
              }}
            >
              Сохранить и завершить сессию
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(`/assessments/${id}`)}>
            Назад
          </Button>
          {message && (
            <p className={`text-sm ${message.includes("Ошибка") ? "text-destructive" : "text-green-600"}`}>
              {message}
            </p>
          )}
        </div>
      )}

    </div>
  );
}

