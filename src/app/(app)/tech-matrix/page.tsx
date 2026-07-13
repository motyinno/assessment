"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SECTION_COLORS, DEFAULT_SECTION_COLOR } from "@/lib/section-colors";
import { RoadmapView } from "@/components/roadmap-view";

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

type ViewMode = "table" | "roadmap";

export default function TechMatrixPage() {
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id;
  const [view, setView] = useState<ViewMode>("table");
  const [matrix, setMatrix] = useState<TechMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/tech-matrix")
      .then((r) => r.json())
      .then((data) => { setMatrix(data); setLoading(false); });
  }, []);

  const filteredSections = useMemo(() => {
    if (!matrix) return [];
    const q = search.toLowerCase().trim();
    return matrix.sections
      .filter((s) => sectionFilter === "all" || s.id === sectionFilter)
      .map((section) => {
        if (!q) return section;
        const filteredTopics = section.topics.filter((topic) => {
          if (topic.title.toLowerCase().includes(q)) return true;
          return [...topic.jun, ...topic.mid, ...topic.sen].some((s) => s.toLowerCase().includes(q));
        });
        return { ...section, topics: filteredTopics };
      })
      .filter((s) => s.topics.length > 0);
  }, [matrix, search, sectionFilter]);

  function toggleSection(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const totalTopics = matrix?.sections.reduce((sum, s) => sum + s.topics.length, 0) || 0;

  const showJun = gradeFilter === "all" || gradeFilter === "jun";
  const showMid = gradeFilter === "all" || gradeFilter === "mid";
  const showSen = gradeFilter === "all" || gradeFilter === "sen";
  const visibleGrades = [showJun, showMid, showSen].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tech matrix</h1>
          {view === "table" ? (
            matrix && (
              <p className="text-muted-foreground text-sm mt-1">
                {matrix.sections.length} sections &middot; {totalTopics} topics
              </p>
            )
          ) : (
            <p className="text-muted-foreground text-sm mt-1">
              Your interactive skill roadmap
            </p>
          )}
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("table")}
          >
            Table
          </Button>
          <Button
            variant={view === "roadmap" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("roadmap")}
          >
            Roadmap
          </Button>
        </div>
      </div>

      {view === "roadmap" ? (
        myId ? (
          <RoadmapView userId={myId} canEdit />
        ) : (
          <p className="text-muted-foreground p-8">Loading roadmap...</p>
        )
      ) : loading ? (
        <p className="text-muted-foreground p-8">Loading matrix...</p>
      ) : !matrix ? (
        <p className="text-destructive p-8">Failed to load</p>
      ) : (
        <>
      {/* Sticky filters + single column header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-3 border-b border-border/40">
        <div className="flex flex-wrap gap-3 pb-3">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <Input
              placeholder="Search by skill..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sectionFilter} onValueChange={(v) => v && setSectionFilter(v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {matrix.sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={gradeFilter} onValueChange={(v) => v && setGradeFilter(v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              <SelectItem value="jun">Junior</SelectItem>
              <SelectItem value="mid">Middle</SelectItem>
              <SelectItem value="sen">Senior</SelectItem>
            </SelectContent>
          </Select>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
        </div>

        {/* Single column header — transparent border matches the section cards'
            border widths so its grid lines up with the rows below. */}
        {filteredSections.length > 0 && (
          <div className="border border-l-4 border-transparent">
            <div
              className="grid bg-muted/40"
              style={{ gridTemplateColumns: `180px repeat(${visibleGrades}, 1fr)` }}
            >
              <div className="px-5 py-2 border-r border-border/60" />
              {showJun && (
                <div className={`px-4 py-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-300 uppercase tracking-wide ${showMid || showSen ? "border-r border-border/60" : ""}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Junior
                  </span>
                </div>
              )}
              {showMid && (
                <div className={`px-4 py-2 text-[11px] font-medium text-blue-600 dark:text-blue-300 uppercase tracking-wide ${showSen ? "border-r border-border/60" : ""}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Middle
                  </span>
                </div>
              )}
              {showSen && (
                <div className="px-4 py-2 text-[11px] font-medium text-purple-600 dark:text-purple-300 uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Senior
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      {filteredSections.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Nothing found</div>
      ) : (
        <div className="space-y-4">
          {filteredSections.map((section) => {
            const isCollapsed = collapsedSections.has(section.id);
            const colors = SECTION_COLORS[section.id] || DEFAULT_SECTION_COLOR;

            return (
              <div key={section.id} className={`border rounded-xl overflow-hidden border-l-4 ${colors.border} bg-card`}>
                {/* Section header */}
                <button
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/20 transition-colors`}
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="text-muted-foreground text-xs transition-transform" style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>
                    ▼
                  </span>
                  <h2 className="text-sm font-semibold">{section.title}</h2>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {section.topics.length}
                  </span>
                </button>

                {/* Topics */}
                {!isCollapsed && (
                  <div className="border-t divide-y divide-border/60">
                    {section.topics.map((topic) => (
                      <div key={topic.id} className="grid" style={{ gridTemplateColumns: `180px repeat(${visibleGrades}, 1fr)` }}>
                        {/* Topic name */}
                        <div className="px-5 py-3 bg-muted/20 border-r border-border/60 flex items-start">
                          <span className="text-[13px] font-medium text-foreground leading-snug">{topic.title}</span>
                        </div>

                        {/* Grade columns */}
                        {showJun && (
                          <GradeColumn
                            skills={topic.jun}
                            grade="jun"
                            search={search}
                            showBorder={showMid || showSen}
                          />
                        )}
                        {showMid && (
                          <GradeColumn
                            skills={topic.mid}
                            grade="mid"
                            search={search}
                            showBorder={showSen}
                          />
                        )}
                        {showSen && (
                          <GradeColumn
                            skills={topic.sen}
                            grade="sen"
                            search={search}
                            showBorder={false}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function GradeColumn({
  skills,
  grade,
  search,
  showBorder,
}: {
  skills: string[];
  grade: string;
  search: string;
  showBorder: boolean;
}) {
  const q = search.toLowerCase().trim();

  const dotColor = grade === "jun" ? "bg-emerald-400" : grade === "mid" ? "bg-blue-400" : "bg-purple-400";
  const highlightBg =
    grade === "jun"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 font-medium"
      : grade === "mid"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-200 font-medium"
        : "bg-purple-500/15 text-purple-700 dark:text-purple-200 font-medium";

  return (
    <div className={`px-4 py-3 ${showBorder ? "border-r border-border/60" : ""}`}>
      {skills.length === 0 ? (
        <span className="text-[11px] text-muted-foreground/40 italic">—</span>
      ) : (
        <ul className="space-y-1">
          {skills.map((skill, i) => {
            const isHighlighted = q && skill.toLowerCase().includes(q);
            return (
              <li
                key={i}
                className={`flex items-start gap-2 text-[12px] leading-relaxed rounded-sm px-1 py-0.5 -mx-1 ${
                  isHighlighted ? highlightBg : "text-foreground/80"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-[5px] shrink-0`} />
                {skill}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
