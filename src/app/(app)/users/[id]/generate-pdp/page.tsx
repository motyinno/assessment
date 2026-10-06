"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiErrorMessage } from "@/lib/api-error";

interface PickerTopic {
  id: string;
  title: string;
  skills: string[];
  score: number | null;
}
interface PickerSection {
  id: string;
  title: string;
  topics: PickerTopic[];
}
interface PdpOptions {
  subject: { id: string; name: string; email: string; grade: string | null; gradeLabel: string };
  assessment: { id: string; title: string; completedAt: string | null } | null;
  sections: PickerSection[];
  preselected: string[];
}

export default function GeneratePdpForUserPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = params.id as string;
  const assessmentIdParam = searchParams.get("assessmentId");

  const [options, setOptions] = useState<PdpOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the employee's direct manager (or an admin) gets options; anyone else
  // sees the API's refusal.
  useEffect(() => {
    const qs = assessmentIdParam ? `?assessmentId=${encodeURIComponent(assessmentIdParam)}` : "";
    fetch(`/api/users/${userId}/pdp-options${qs}`).then(async (r) => {
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setLoadError(apiErrorMessage(data, "Couldn't load the topics"));
        return;
      }
      const o = data as PdpOptions;
      setOptions(o);
      setSelected(new Set(o.preselected));
    });
  }, [userId, assessmentIdParam]);

  const filtered = useMemo(() => options?.sections ?? [], [options]);

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
  function addCustomTopics(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setCustomTopics((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((t) => t.toLowerCase()));
      for (const p of parts) {
        if (!seen.has(p.toLowerCase())) {
          seen.add(p.toLowerCase());
          next.push(p);
        }
      }
      return next;
    });
    setCustomInput("");
  }
  function removeCustomTopic(title: string) {
    setCustomTopics((prev) => prev.filter((t) => t !== title));
  }
  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCustomTopics(customInput);
    } else if (e.key === "Backspace" && customInput === "" && customTopics.length) {
      removeCustomTopic(customTopics[customTopics.length - 1]);
    }
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
    // Flush any half-typed custom technology still sitting in the input.
    const pending = customInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set(customTopics.map((t) => t.toLowerCase()));
    const allCustom = [...customTopics];
    for (const p of pending) {
      if (!seen.has(p.toLowerCase())) {
        seen.add(p.toLowerCase());
        allCustom.push(p);
      }
    }
    try {
      const res = await fetch(`/api/users/${userId}/generate-pdp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: filtered.flatMap((s) => s.topics.map((t) => t.id)).filter((id) => selected.has(id)),
          customTopics: allCustom,
          assessmentId: options?.assessment?.id ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(data, "Failed to generate"));
      }
      // The AI drafts in the background; the builder shows progress and opens
      // the plan for editing when it's ready.
      const { id } = (await res.json()) as { id: string };
      router.push(`/pdps/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setGenerating(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }
  if (!options) {
    return <p className="text-muted-foreground">Loading...</p>;
  }
  const user = options.subject;

  if (!user.grade) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Generate PDP</h1>
        <Card>
          <CardContent className="py-6">
            <p className="text-sm">
              User <b>{user.name}</b> has no grade assigned. Set a grade on the user's profile before generating.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create PDP</h1>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
          <span>{user.name}</span>
          <Badge variant="outline">{user.gradeLabel}</Badge>
          <span>·</span>
          <span>{user.email}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick the topics; the AI drafts questions and practical tasks, then you arrange and approve the plan in the
          builder.
          {options.assessment && (
            <>
              {" "}Scores are from{" "}
              <Link href={`/assessments/${options.assessment.id}`} className="text-primary hover:underline">
                {options.assessment.title}
              </Link>
              ; topics below 7 are preselected.
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tech matrix topics ({selected.size} selected)
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
                          <div className="font-medium flex items-center gap-2">
                            {topic.title}
                            {topic.score !== null && (
                              <Badge variant={topic.score < 7 ? "destructive" : "secondary"}>{topic.score}/10</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{topic.skills.join(" · ")}</div>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Custom technologies{" "}
            <span className="font-normal text-muted-foreground">
              (optional — always included as priority)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Add technologies you want in this PDP even if they aren't in the matrix.
            The AI must include each one as its own topic. Press Enter or comma to add.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
            {customTopics.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeCustomTopic(t)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              onBlur={() => addCustomTopics(customInput)}
              placeholder={customTopics.length ? "" : "e.g. Kafka, gRPC, Terraform"}
              className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={
            generating ||
            (selected.size === 0 && customTopics.length === 0 && customInput.trim() === "")
          }
        >
          {generating ? "Starting..." : "Draft PDP"}
        </Button>
        <Button variant="outline" onClick={() => router.push(`/users/${userId}`)}>
          Cancel
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
