"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { gradeLabel, baseGrade } from "@/lib/grades";
import { cn } from "@/lib/utils";

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

interface MatrixTopic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}
interface MatrixSection {
  id: string;
  title: string;
  topics: MatrixTopic[];
}
interface TechMatrix {
  sections: MatrixSection[];
}

interface TopicMeta {
  title: string;
  sectionTitle: string;
  sectionId: string;
  skills: string[];
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function scoreTone(score: number | null) {
  if (score === null) return { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" };
  if (score >= 7) return { bg: "bg-success/15", text: "text-success", ring: "ring-success/25" };
  if (score >= 5) return { bg: "bg-warning/25", text: "text-warning-foreground", ring: "ring-warning/40" };
  return { bg: "bg-destructive/15", text: "text-destructive", ring: "ring-destructive/25" };
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
  const [matrix, setMatrix] = useState<TechMatrix | null>(null);
  const [settings, setSettings] = useState({
    maxQuestions: 2,
    threshold: 5,
    useAI: false,
  });
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadData() {
    const [assessmentRes, resultsRes, matrixRes] = await Promise.all([
      fetch(`/api/assessments/${id}`),
      fetch(`/api/assessments/${id}/results`),
      fetch(`/api/tech-matrix`),
    ]);

    if (assessmentRes.ok && resultsRes.ok) {
      const a = await assessmentRes.json();
      const results = await resultsRes.json();
      const m = matrixRes.ok ? await matrixRes.json() : null;

      setAssessment({ title: a.title, grade: a.grade, aiFeedback: a.aiFeedback });
      if (m) setMatrix(m);

      const subjectUser = a.participants
        .filter((p: { participantRole: string }) => p.participantRole === "SUBJECT")
        .map((p: { user: SubjectUser }) => p.user)[0];
      setSubject(subjectUser || null);

      setTopics(
        results.map(
          (r: {
            category: string;
            score: number | null;
            comment: string | null;
            subtopics: string | null;
          }) => ({
            name: r.category,
            score: r.score,
            subtopics: r.subtopics ? JSON.parse(r.subtopics) : [],
            comment: r.comment || "",
            selected: r.score !== null && r.score < settings.threshold,
          })
        )
      );
    }
  }

  // Build id → {title, section, skills} map from matrix for human labels
  const topicMeta = useMemo(() => {
    const map: Record<string, TopicMeta> = {};
    if (!matrix || !assessment) return map;
    const base = baseGrade(assessment.grade);
    for (const section of matrix.sections) {
      for (const topic of section.topics) {
        const skills = (topic[base as keyof MatrixTopic] as unknown as string[]) ?? [];
        map[topic.id] = {
          title: topic.title,
          sectionTitle: section.title,
          sectionId: section.id,
          skills,
        };
      }
    }
    return map;
  }, [matrix, assessment]);

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
    const outputName = `PDP_${subject.name.replace(/\s+/g, "_")}.docx`;

    const body = {
      weakTopics: selectedTopics,
      info: {
        employee: subject.name,
        manager: subject.manager || "",
        grade: assessment.grade,
        date: new Date().toLocaleDateString("en-US"),
        level_before: gradeLabel(assessment.grade),
        next_date: "",
        project: subject.project || "",
        interviewer: session?.user?.name || "",
      },
      settings: {
        maxQuestions: settings.maxQuestions,
        threshold: settings.threshold,
        outputName,
        includeTasks: true,
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
        setMessage("Failed to generate");
        setGenerating(false);
        return;
      }

      const blob = await res.blob();

      const formData = new FormData();
      formData.append("file", blob, outputName);
      formData.append("fileName", outputName);
      formData.append("userId", subject.id);
      formData.append("assessmentId", id);
      formData.append("topicsJson", JSON.stringify(selectedTopics.map((t) => t.name)));

      await fetch("/api/pdps", { method: "POST", body: formData });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputName;
      a.click();
      URL.revokeObjectURL(url);

      setMessage("PDP generated and saved");
    } catch {
      setMessage("Failed to generate");
    }
    setGenerating(false);
  }

  if (!assessment) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const selectedCount = topics.filter((t) => t.selected).length;
  const weakCount = topics.filter(
    (t) => t.score !== null && t.score < settings.threshold
  ).length;
  const avgScore = (() => {
    const withScore = topics.filter((t) => t.score !== null) as Array<
      TopicWithSelection & { score: number }
    >;
    if (withScore.length === 0) return null;
    return (
      withScore.reduce((a, b) => a + b.score, 0) / withScore.length
    ).toFixed(1);
  })();

  // Group topics by section for nicer rendering
  const grouped: Record<
    string,
    { sectionTitle: string; items: Array<{ idx: number; t: TopicWithSelection }> }
  > = {};
  topics.forEach((t, idx) => {
    const meta = topicMeta[t.name];
    const key = meta?.sectionId ?? "_other";
    if (!grouped[key]) {
      grouped[key] = {
        sectionTitle: meta?.sectionTitle ?? "Other",
        items: [],
      };
    }
    grouped[key].items.push({ idx, t });
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href={`/assessments/${id}`} className="hover:text-foreground transition-colors">
          {assessment.title}
        </Link>
        <span>/</span>
        <span className="text-foreground/70">Generate PDP</span>
      </div>

      {/* Identity + settings banner */}
      <Card>
        <CardContent className="pt-5 pb-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-5">
            {/* Subject */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary flex items-center justify-center text-base font-semibold ring-1 ring-primary/15">
                {subject ? initialsOf(subject.name) : "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {subject?.name ?? "No employee"}
                  </h1>
                  <Badge variant="outline">{gradeLabel(assessment.grade)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {subject?.email ?? "—"}
                </p>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                  <MetaItem label="Project" value={subject?.project ?? null} />
                  <MetaItem label="Manager" value={subject?.manager ?? null} />
                  <MetaItem
                    label="Average score"
                    value={avgScore !== null ? avgScore : null}
                  />
                  <MetaItem
                    label="Weak topics"
                    value={`${weakCount} < ${settings.threshold}`}
                  />
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="grid grid-cols-2 gap-3 lg:w-[360px] lg:shrink-0">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Questions per topic
                </Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(settings.maxQuestions)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    setSettings({
                      ...settings,
                      maxQuestions: isNaN(n) ? 0 : n,
                    });
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Threshold (below = include)
                </Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(settings.threshold)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    applyThreshold(isNaN(n) ? 0 : n);
                  }}
                  className="h-9"
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-xs rounded-md border border-border bg-background px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={settings.useAI}
                  onChange={(e) =>
                    setSettings({ ...settings, useAI: e.target.checked })
                  }
                />
                AI-generated questions and tasks based on the score
              </label>
            </div>
          </div>

          {/* Selection summary bar */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">
                {selectedCount}
              </span>
              <span className="text-xs text-muted-foreground">
                of {topics.length} topics selected
              </span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTopics((prev) =>
                    prev.map((t) => ({
                      ...t,
                      selected: t.score !== null && t.score < settings.threshold,
                    }))
                  )
                }
              >
                By threshold ({weakCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTopics((prev) => prev.map((t) => ({ ...t, selected: true })))
                }
              >
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTopics((prev) => prev.map((t) => ({ ...t, selected: false })))
                }
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topics — grouped grid */}
      <Card>
        <CardHeader>
          <CardTitle>PDP topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No topic scores — fill in the tech matrix first.
            </p>
          ) : (
            Object.entries(grouped).map(([sectionId, group]) => (
              <div key={sectionId}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {group.sectionTitle}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.items.map(({ idx, t }) => {
                    const meta = topicMeta[t.name];
                    const tone = scoreTone(t.score);
                    const title = meta?.title ?? t.name;
                    const skillsPreview =
                      meta?.skills.slice(0, 3).join(" · ") ?? "";
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleTopic(idx)}
                        className={cn(
                          "group/topic text-left rounded-xl border p-3 transition-all",
                          t.selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={cn(
                              "mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                              t.selected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-background border-border"
                            )}
                          >
                            {t.selected && (
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {title}
                              </p>
                              <div
                                className={cn(
                                  "shrink-0 inline-flex items-center justify-center h-6 min-w-[28px] px-1.5 rounded-md text-xs font-semibold ring-1 ring-inset",
                                  tone.bg,
                                  tone.text,
                                  tone.ring
                                )}
                              >
                                {t.score ?? "—"}
                              </div>
                            </div>
                            {skillsPreview && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {skillsPreview}
                                {meta && meta.skills.length > 3 && (
                                  <span> +{meta.skills.length - 3}</span>
                                )}
                              </p>
                            )}
                            {t.comment && (
                              <p className="text-[11px] text-foreground/70 mt-1 line-clamp-2">
                                {t.comment}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background/85 backdrop-blur border-t border-border flex items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={generating || selectedCount === 0}
          size="lg"
        >
          {generating
            ? "Generating..."
            : `Generate PDP (${selectedCount} ${
                selectedCount === 1 ? "topic" : "topics"
              })`}
        </Button>
        <Button variant="outline" onClick={() => router.push(`/assessments/${id}`)}>
          Back
        </Button>
        {message && (
          <p
            className={cn(
              "text-sm ml-auto",
              message.toLowerCase().includes("failed") ? "text-destructive" : "text-success"
            )}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground uppercase tracking-wide text-[10px]">
        {label}
      </p>
      <p className="text-foreground truncate mt-0.5">{value || "—"}</p>
    </div>
  );
}

