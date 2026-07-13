"use client";

import { useEffect, useMemo, useState } from "react";
import type { Grade } from "@/lib/types";
import {
  STATUS_META,
  STATUS_ORDER,
  BAND_LABELS,
  BANDS,
  combineStatus,
  type RoadmapDTO,
  type RoadmapTopicDTO,
} from "@/lib/roadmap-types";
import { gradeLabel } from "@/lib/grades";
import { cn } from "@/lib/utils";
import { RoadmapSection } from "@/components/roadmap-section";
import { RoadmapNodeDetail } from "@/components/roadmap-node-detail";

/** Optimistically set the resolved-skill set for one topic+band. */
function applyResolved(
  dto: RoadmapDTO,
  topicId: string,
  band: Grade,
  resolved: string[]
): RoadmapDTO {
  return {
    ...dto,
    sections: dto.sections.map((section) => ({
      ...section,
      topics: section.topics.map((topic) => {
        if (topic.id !== topicId) return topic;
        const resolvedSkills = { ...topic.resolvedSkills, [band]: resolved };
        return {
          ...topic,
          resolvedSkills,
          status: {
            ...topic.status,
            [band]: combineStatus(
              topic.scores[band],
              resolved.length,
              topic.skills[band].length
            ),
          },
        };
      }),
    })),
  };
}

export function RoadmapView({
  userId,
  canEdit = false,
}: {
  userId: string;
  canEdit?: boolean;
}) {
  const [roadmap, setRoadmap] = useState<RoadmapDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/users/${userId}/roadmap`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: RoadmapDTO) => setRoadmap(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [userId]);

  // The band the roadmap focuses on. Defaults to the user's current grade — the
  // level they're actually being assessed at — and can be changed to look ahead.
  const [focalOverride, setFocalOverride] = useState<Grade | null>(null);
  const focalGrade: Grade = focalOverride ?? roadmap?.currentGrade ?? "jun";

  // Only show topics that actually have skills at the focal grade — e.g. Web
  // Workers has no Junior-level skills, so it shouldn't appear on the Junior
  // roadmap. Sections left with no topics drop out entirely.
  const focalSections = useMemo(() => {
    if (!roadmap) return [];
    return roadmap.sections
      .map((s) => ({
        ...s,
        topics: s.topics.filter((t) => t.skills[focalGrade].length > 0),
      }))
      .filter((s) => s.topics.length > 0);
  }, [roadmap, focalGrade]);

  const selectedTopic: RoadmapTopicDTO | null = useMemo(() => {
    if (!roadmap || !selectedId) return null;
    for (const s of roadmap.sections) {
      const t = s.topics.find((t) => t.id === selectedId);
      if (t) return t;
    }
    return null;
  }, [roadmap, selectedId]);

  async function handleSetResolved(
    topic: RoadmapTopicDTO,
    grade: Grade,
    resolved: string[]
  ) {
    if (!roadmap || !canEdit) return;
    const section = roadmap.sections.find((s) =>
      s.topics.some((t) => t.id === topic.id)
    );
    if (!section) return;

    const prev = roadmap;
    setRoadmap(applyResolved(roadmap, topic.id, grade, resolved)); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/roadmap/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              sectionId: section.id,
              topicId: topic.id,
              grade,
              resolvedSkills: resolved,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error();
      const fresh: RoadmapDTO = await res.json();
      setRoadmap(fresh);
    } catch {
      setRoadmap(prev); // revert
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-8 text-muted-foreground">Loading roadmap...</p>;
  if (error || !roadmap)
    return <p className="p-8 text-destructive">Failed to load roadmap</p>;

  return (
    <div className="space-y-5">
      {/* Progress header */}
      <div className="space-y-2.5 rounded-xl border bg-card/40 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Focal-grade selector — which band the nodes reflect */}
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {BANDS.map((band) => {
              const active = band === focalGrade;
              const isCurrent = band === roadmap.currentGrade;
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => setFocalOverride(band)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {BAND_LABELS[band]}
                  {isCurrent && (
                    <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                      you
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full border", STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Currently{" "}
          <span className="font-medium text-foreground">{gradeLabel(roadmap.currentGrade)}</span>
          {roadmap.nextGrade && (
            <>
              {" "}· working toward{" "}
              <span className="font-medium text-foreground">{gradeLabel(roadmap.nextGrade)}</span>
            </>
          )}
          {" "}· showing{" "}
          <span className="font-medium text-foreground">{BAND_LABELS[focalGrade]}</span> level
        </p>
      </div>

      {/* Section spines */}
      {focalSections.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No {BAND_LABELS[focalGrade]}-level topics.
        </p>
      ) : (
        <div className="space-y-4">
          {focalSections.map((section) => (
            <RoadmapSection
              key={section.id}
              section={section}
              focalGrade={focalGrade}
              onSelect={(t) => setSelectedId(t.id)}
            />
          ))}
        </div>
      )}

      <RoadmapNodeDetail
        focalGrade={focalGrade}
        topic={selectedTopic}
        canEdit={canEdit}
        onClose={() => setSelectedId(null)}
        onSetResolved={handleSetResolved}
        saving={saving}
      />
    </div>
  );
}
