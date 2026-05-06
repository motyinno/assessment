"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { baseGrade, gradeLabel } from "@/lib/grades";

interface TechMatrixTopic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}

interface TechMatrixSection {
  id: string;
  title: string;
  topics: TechMatrixTopic[];
}

interface TechMatrix {
  sections: TechMatrixSection[];
}

interface SelfAssessmentItem {
  sectionId: string;
  topicId: string;
  score: number | null;
  comment?: string | null;
}

interface AssessmentResult {
  category: string;
  score: number | null;
  comment: string | null;
}

interface AssessmentMatrixProps {
  assessmentId: string;
  grade: string;
  isSubject: boolean;
  isAssessor: boolean;
}

const SECTION_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  js: { border: "border-l-yellow-400", bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-300" },
  typescript: { border: "border-l-blue-500", bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-300" },
  backend: { border: "border-l-green-600", bg: "bg-green-500/10", text: "text-green-700 dark:text-green-300" },
  react: { border: "border-l-cyan-500", bg: "bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300" },
  databases: { border: "border-l-orange-500", bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-300" },
  web: { border: "border-l-indigo-500", bg: "bg-indigo-500/10", text: "text-indigo-700 dark:text-indigo-300" },
  general: { border: "border-l-gray-500", bg: "bg-gray-500/10", text: "text-gray-700 dark:text-gray-300" },
  devops: { border: "border-l-red-500", bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300" },
  "message-brokers": { border: "border-l-amber-600", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300" },
  "principles-and-patterns": { border: "border-l-teal-600", bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-300" },
  architecture: { border: "border-l-violet-600", bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-300" },
  ai: { border: "border-l-pink-500", bg: "bg-pink-500/10", text: "text-pink-700 dark:text-pink-300" },
};

const GRADE_DOT: Record<string, string> = { jun: "bg-emerald-400", mid: "bg-blue-400", sen: "bg-purple-400" };
const GRADE_DOT_BG: Record<string, string> = { jun: "bg-emerald-500", mid: "bg-blue-500", sen: "bg-purple-500" };
const GRADE_LABEL_COLOR: Record<string, string> = {
  jun: "text-emerald-600 dark:text-emerald-300",
  mid: "text-blue-600 dark:text-blue-300",
  sen: "text-purple-600 dark:text-purple-300",
};

export function AssessmentMatrix({ assessmentId, grade, isSubject, isAssessor }: AssessmentMatrixProps) {
  const [matrix, setMatrix] = useState<TechMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selfScores, setSelfScores] = useState<Record<string, number | null>>({});
  const [assessorScores, setAssessorScores] = useState<Record<string, { score: number | null; comment: string }>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const pendingRef = useRef<Map<string, { sectionId: string; topicId: string; score: number | null }>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setLoading(true);

    async function fetchOk(url: string): Promise<unknown> {
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`${url} → ${r.status}${text ? `: ${text}` : ""}`);
      }
      return r.json();
    }

    Promise.all([
      fetchOk("/api/tech-matrix"),
      fetchOk(`/api/assessments/${assessmentId}/self-assessment`),
      fetchOk(`/api/assessments/${assessmentId}/results`),
    ])
      .then(([matrixData, saItems, results]) => {
        if (cancelled) return;
        const m = matrixData as TechMatrix;
        setMatrix(m);
        setCollapsedSections(new Set(m.sections.map((s) => s.id)));
        const sm: Record<string, number | null> = {};
        if (Array.isArray(saItems)) {
          for (const item of saItems as SelfAssessmentItem[]) sm[item.topicId] = item.score;
        }
        setSelfScores(sm);
        const am: Record<string, { score: number | null; comment: string }> = {};
        if (Array.isArray(results)) {
          for (const r of results as AssessmentResult[])
            am[r.category] = { score: r.score, comment: r.comment || "" };
        }
        setAssessorScores(am);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Surface to UI instead of silently leaving an empty matrix.
        setLoadError(`Failed to load assessment data. ${msg}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  // Self-assessment debounced save
  const flushPending = useCallback(() => {
    const items = Array.from(pendingRef.current.values());
    if (items.length === 0) return;
    pendingRef.current.clear();
    setSaving(true);
    fetch(`/api/assessments/${assessmentId}/self-assessment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }).finally(() => setSaving(false));
  }, [assessmentId]);

  const handleSelfScoreChange = useCallback((sectionId: string, topicId: string, value: number | null) => {
    setSelfScores((prev) => ({ ...prev, [topicId]: value }));
    pendingRef.current.set(topicId, { sectionId, topicId, score: value });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushPending, 500);
  }, [flushPending]);

  // Assessor score save (debounced per topic)
  const assessorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAssessorChange = useCallback((topicId: string, field: "score" | "comment", value: string | number | null) => {
    setAssessorScores((prev) => ({
      ...prev,
      [topicId]: {
        score: field === "score" ? (value as number | null) : (prev[topicId]?.score ?? null),
        comment: field === "comment" ? (value as string) : (prev[topicId]?.comment ?? ""),
      },
    }));
    if (assessorTimerRef.current) clearTimeout(assessorTimerRef.current);
    assessorTimerRef.current = setTimeout(() => {
      // Save all assessor scores as results
      const results = Object.entries(assessorScores).map(([cat, data]) => ({
        category: cat,
        score: cat === topicId && field === "score" ? value : data.score,
        comment: cat === topicId && field === "comment" ? value : data.comment,
        subtopics: [],
      }));
      // Also include the just-changed one if not in list
      if (!assessorScores[topicId]) {
        results.push({
          category: topicId,
          score: field === "score" ? (value as number | null) : null,
          comment: field === "comment" ? (value as string) : "",
          subtopics: [],
        });
      }
      fetch(`/api/assessments/${assessmentId}/results`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
    }, 800);
  }, [assessmentId, assessorScores]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const items = Array.from(pendingRef.current.values());
      if (items.length > 0) {
        navigator.sendBeacon(
          `/api/assessments/${assessmentId}/self-assessment`,
          new Blob([JSON.stringify({ items })], { type: "application/json" })
        );
      }
    };
  }, [assessmentId]);

  function toggleSection(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return <p className="text-muted-foreground py-4">Loading matrix...</p>;
  if (loadError) {
    return (
      <div className="py-4 text-sm text-destructive">
        <p className="font-medium">Couldn&rsquo;t load the matrix.</p>
        <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
      </div>
    );
  }
  if (!matrix) return <p className="text-destructive py-4">Failed to load</p>;

  const base = baseGrade(grade);
  const dotColor = GRADE_DOT[base] || "bg-gray-400";

  const filteredSections = matrix.sections
    .map((section) => ({
      ...section,
      topics: section.topics.filter(
        (topic) => (topic[base as keyof TechMatrixTopic] as string[])?.length > 0
      ),
    }))
    .filter((section) => section.topics.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${GRADE_DOT_BG[base] || "bg-gray-500"}`} />
          <span className={`text-sm font-medium ${GRADE_LABEL_COLOR[base] || "text-gray-600"} uppercase tracking-wide`}>
            Tech matrix &middot; {gradeLabel(grade)}
          </span>
        </div>
        {saving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
      </div>

      {filteredSections.map((section) => {
        const isCollapsed = collapsedSections.has(section.id);
        const colors = SECTION_COLORS[section.id] || { border: "border-l-gray-400", bg: "bg-gray-500/10", text: "text-gray-700 dark:text-gray-300" };

        return (
          <div key={section.id} className={`border rounded-lg overflow-hidden border-l-4 ${colors.border} bg-card`}>
            <button
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors"
              onClick={() => toggleSection(section.id)}
            >
              <span className="text-muted-foreground text-xs transition-transform" style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>▼</span>
              <h3 className="text-[13px] font-semibold">{section.title}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{section.topics.length}</span>
            </button>

            {!isCollapsed && (
              <div className="border-t">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium w-[140px]">Topic</th>
                      <th className="text-left px-3 py-2 font-medium border-l border-border/60 w-[280px]">
                        <span className={`inline-flex items-center gap-1 ${GRADE_LABEL_COLOR[base]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${GRADE_DOT_BG[base]}`} />
                          Skills
                        </span>
                      </th>
                      <th className="text-center px-2 py-2 font-medium border-l border-border/60 w-[120px]">Self-assessment</th>
                      <th className="text-center px-2 py-2 font-medium border-l border-border/60 w-[70px]">Score</th>
                      <th className="text-left px-2 py-2 font-medium border-l border-border/60 w-[160px]">Comment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {section.topics.map((topic) => {
                      const skills = topic[base as keyof TechMatrixTopic] as string[];
                      const aScore = assessorScores[topic.id];

                      return (
                        <tr key={topic.id} className="hover:bg-muted/10">
                          <td className="px-3 py-2 align-top font-medium text-foreground bg-muted/10 border-r border-border/40">
                            {topic.title}
                          </td>
                          <td className="px-3 py-2 align-top border-r border-border/40 w-[280px]">
                            <ul className="space-y-0.5">
                              {skills.map((skill, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-foreground/80 leading-snug">
                                  <span className={`w-1 h-1 rounded-full ${dotColor} mt-[6px] shrink-0`} />
                                  {skill}
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="px-2 py-2 align-top border-r border-border/40">
                            <div className="flex justify-center">
                              <ScoreSelector
                                score={selfScores[topic.id] ?? null}
                                onChange={(v) => handleSelfScoreChange(section.id, topic.id, v)}
                                disabled={!isSubject}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top border-r border-border/40">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={2}
                              value={aScore?.score ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                                const n = raw === "" ? null : Number(raw);
                                const clamped = n === null ? null : Math.min(Math.max(n, 0), 10);
                                handleAssessorChange(topic.id, "score", clamped);
                              }}
                              disabled={!isAssessor}
                              className="w-full h-7 text-center text-[12px] rounded border border-border/60 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                              placeholder="—"
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="text"
                              value={aScore?.comment ?? ""}
                              onChange={(e) => handleAssessorChange(topic.id, "comment", e.target.value)}
                              disabled={!isAssessor}
                              className="w-full h-7 text-[12px] rounded border border-border/60 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                              placeholder="Comment..."
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoreSelector({ score, onChange, disabled }: { score: number | null; onChange: (v: number | null) => void; disabled: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((v) => {
        const isActive = score === v;
        const color = v <= 2 ? "bg-red-500" : v === 3 ? "bg-yellow-500" : "bg-emerald-500";
        const inactiveColor = v <= 2 ? "border-red-300" : v === 3 ? "border-yellow-300" : "border-emerald-300";
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(isActive ? null : v)}
            className={`w-5 h-5 rounded-full text-[9px] font-medium flex items-center justify-center transition-all ${
              isActive
                ? `${color} text-white shadow-sm`
                : `border ${inactiveColor} text-muted-foreground ${disabled ? "opacity-40 cursor-default" : "cursor-pointer hover:bg-muted/60"}`
            }`}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
