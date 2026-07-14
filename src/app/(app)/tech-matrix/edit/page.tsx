"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirm-dialog";
import { SECTION_COLORS, DEFAULT_SECTION_COLOR } from "@/lib/section-colors";

interface Topic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}
interface Section {
  id: string;
  title: string;
  topics: Topic[];
}

const BANDS = ["jun", "mid", "sen"] as const;
type Band = (typeof BANDS)[number];
const BAND_LABELS: Record<Band, string> = {
  jun: "Junior",
  mid: "Middle",
  sen: "Senior",
};

export default function TechMatrixEditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [newSection, setNewSection] = useState("");
  const [topicDrafts, setTopicDrafts] = useState<Record<string, string>>({});
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({});

  const { confirm, confirmDialog } = useConfirm();

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";

  const reload = useCallback(async () => {
    const res = await fetch("/api/tech-matrix");
    if (res.ok) {
      const data = await res.json();
      setSections(data.sections ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }
    reload();
  }, [status, isAdmin, router, reload]);

  // ---- Section mutations ----
  async function addSection() {
    const title = newSection.trim();
    if (!title) return;
    const res = await fetch("/api/tech-matrix/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setNewSection("");
      reload();
    }
  }

  async function renameSection(id: string, title: string) {
    await fetch(`/api/tech-matrix/sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function deleteSection(section: Section) {
    const ok = await confirm({
      title: `Delete section “${section.title}”?`,
      description: `Its ${section.topics.length} topic(s) will be removed. Users' progress on these topics will be orphaned — kept in the database but no longer shown.`,
      confirmLabel: "Delete section",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/tech-matrix/sections/${section.id}`, {
      method: "DELETE",
    });
    if (res.ok) reload();
  }

  // ---- Topic mutations ----
  async function addTopic(sectionId: string) {
    const title = (topicDrafts[sectionId] ?? "").trim();
    if (!title) return;
    const res = await fetch("/api/tech-matrix/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId, title }),
    });
    if (res.ok) {
      setTopicDrafts((d) => ({ ...d, [sectionId]: "" }));
      reload();
    }
  }

  async function renameTopic(id: string, title: string) {
    await fetch(`/api/tech-matrix/topics/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function deleteTopic(topic: Topic) {
    const ok = await confirm({
      title: `Delete topic “${topic.title}”?`,
      description:
        "Users' progress on this topic will be orphaned — kept in the database but no longer shown.",
      confirmLabel: "Delete topic",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/tech-matrix/topics/${topic.id}`, {
      method: "DELETE",
    });
    if (res.ok) reload();
  }

  /** Persist a topic's skill list for one band and mirror it into local state. */
  async function saveSkills(topic: Topic, band: Band, skills: string[]) {
    // Optimistic local update so chips update instantly.
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        topics: s.topics.map((t) =>
          t.id === topic.id ? { ...t, [band]: skills } : t
        ),
      }))
    );
    await fetch(`/api/tech-matrix/topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [band]: skills }),
    });
  }

  function addSkill(topic: Topic, band: Band) {
    const key = `${topic.id}:${band}`;
    const value = (skillDrafts[key] ?? "").trim();
    if (!value) return;
    if (topic[band].includes(value)) {
      setSkillDrafts((d) => ({ ...d, [key]: "" }));
      return;
    }
    saveSkills(topic, band, [...topic[band], value]);
    setSkillDrafts((d) => ({ ...d, [key]: "" }));
  }

  function removeSkill(topic: Topic, band: Band, skill: string) {
    saveSkills(
      topic,
      band,
      topic[band].filter((s) => s !== skill)
    );
  }

  // Update a title in local state (committed to the server on blur).
  function setSectionTitleLocal(id: string, title: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s))
    );
  }
  function setTopicTitleLocal(id: string, title: string) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        topics: s.topics.map((t) => (t.id === id ? { ...t, title } : t)),
      }))
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit tech matrix</h1>
          <p className="page-subtitle mt-1">
            Add, rename, or remove sections, topics, and questions. Deleting an
            item orphans (but never deletes) users' existing progress on it.
          </p>
        </div>
        <div className="inline-flex self-center rounded-lg border border-border bg-card p-0.5">
          <Button
            variant={mode === "edit" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("edit")}
          >
            Edit
          </Button>
          <Button
            variant={mode === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("preview")}
          >
            Preview
          </Button>
        </div>
      </div>

      {/* Add a section (edit mode only) */}
      {mode === "edit" && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4">
            <Input
              value={newSection}
              placeholder="New section title (e.g. GraphQL)"
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSection();
              }}
            />
            <Button onClick={addSection}>Add section</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : mode === "preview" ? (
        <MatrixPreview sections={sections} />
      ) : (
        sections.map((section) => (
          <Card key={section.id}>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Input
                  value={section.title}
                  className="max-w-sm font-medium"
                  onChange={(e) =>
                    setSectionTitleLocal(section.id, e.target.value)
                  }
                  onBlur={(e) => renameSection(section.id, e.target.value.trim())}
                />
                <Badge variant="outline">
                  {section.topics.length} topic
                  {section.topics.length === 1 ? "" : "s"}
                </Badge>
                <code className="text-[11px] text-muted-foreground">
                  {section.id}
                </code>
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  onClick={() => deleteSection(section)}
                >
                  Delete section
                </Button>
              </div>

              <div className="divide-y">
                {section.topics.map((topic) => (
                  <div key={topic.id} className="px-4 py-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={topic.title}
                        className="max-w-sm"
                        onChange={(e) =>
                          setTopicTitleLocal(topic.id, e.target.value)
                        }
                        onBlur={(e) =>
                          renameTopic(topic.id, e.target.value.trim())
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive"
                        onClick={() => deleteTopic(topic)}
                      >
                        Delete topic
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      {BANDS.map((band) => {
                        const key = `${topic.id}:${band}`;
                        return (
                          <div
                            key={band}
                            className="rounded-lg border bg-muted/20 p-3 space-y-2"
                          >
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {BAND_LABELS[band]}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {topic[band].length === 0 && (
                                <span className="text-xs text-muted-foreground">
                                  No questions
                                </span>
                              )}
                              {topic[band].map((skill) => (
                                <span
                                  key={skill}
                                  className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs ring-1 ring-border"
                                >
                                  {skill}
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      removeSkill(topic, band, skill)
                                    }
                                    aria-label={`Remove ${skill}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={skillDrafts[key] ?? ""}
                                placeholder="Add question…"
                                className="h-7 text-xs"
                                onChange={(e) =>
                                  setSkillDrafts((d) => ({
                                    ...d,
                                    [key]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addSkill(topic, band);
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addSkill(topic, band)}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add a topic */}
              <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-3">
                <Input
                  value={topicDrafts[section.id] ?? ""}
                  placeholder="New topic title"
                  className="max-w-sm"
                  onChange={(e) =>
                    setTopicDrafts((d) => ({
                      ...d,
                      [section.id]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTopic(section.id);
                  }}
                />
                <Button variant="outline" onClick={() => addTopic(section.id)}>
                  Add topic
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {confirmDialog}
    </div>
  );
}

const BAND_DOT: Record<Band, string> = {
  jun: "bg-emerald-400",
  mid: "bg-blue-400",
  sen: "bg-purple-400",
};

/**
 * Read-only, live preview of the matrix in the same visual language as the
 * main /tech-matrix table view (colored section rails, three grade columns).
 * Renders straight from the editor's local `sections` state so edits show up
 * immediately when switching to Preview.
 */
function MatrixPreview({ sections }: { sections: Section[] }) {
  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to preview yet — add a section first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grade legend */}
      <div className="grid rounded-lg border border-border/60 bg-muted/20 text-[11px] font-medium uppercase tracking-wide"
        style={{ gridTemplateColumns: "180px repeat(3, 1fr)" }}
      >
        <div className="px-5 py-2 border-r border-border/60" />
        {BANDS.map((band, i) => (
          <div
            key={band}
            className={`px-4 py-2 ${i < 2 ? "border-r border-border/60" : ""}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${BAND_DOT[band]}`} />
              {BAND_LABELS[band]}
            </span>
          </div>
        ))}
      </div>

      {sections.map((section) => {
        const colors = SECTION_COLORS[section.id] || DEFAULT_SECTION_COLOR;
        return (
          <div
            key={section.id}
            className={`border rounded-xl overflow-hidden border-l-4 ${colors.border} bg-card`}
          >
            <div className="flex items-center gap-3 px-5 py-3">
              <h2 className="text-sm font-semibold">{section.title}</h2>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
              >
                {section.topics.length}
              </span>
            </div>

            {section.topics.length > 0 && (
              <div className="border-t divide-y divide-border/60">
                {section.topics.map((topic) => (
                  <div
                    key={topic.id}
                    className="grid"
                    style={{ gridTemplateColumns: "180px repeat(3, 1fr)" }}
                  >
                    <div className="px-5 py-3 bg-muted/20 border-r border-border/60 flex items-start">
                      <span className="text-[13px] font-medium leading-snug">
                        {topic.title}
                      </span>
                    </div>
                    <PreviewGradeCol skills={topic.jun} band="jun" showBorder />
                    <PreviewGradeCol skills={topic.mid} band="mid" showBorder />
                    <PreviewGradeCol skills={topic.sen} band="sen" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewGradeCol({
  skills,
  band,
  showBorder = false,
}: {
  skills: string[];
  band: Band;
  showBorder?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 ${showBorder ? "border-r border-border/60" : ""}`}
    >
      {skills.length === 0 ? (
        <span className="text-xs text-muted-foreground/40">—</span>
      ) : (
        <ul className="space-y-1.5">
          {skills.map((s) => (
            <li
              key={s}
              className="flex items-start gap-2 text-[12px] leading-snug"
            >
              <span
                className={`mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full ${BAND_DOT[band]}`}
              />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
