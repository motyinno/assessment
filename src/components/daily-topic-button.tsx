"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DailyTopicResource {
  label: string;
  url: string;
}
interface DailyTopic {
  kind: "concept" | "problem";
  title: string;
  category: string;
  summary: string;
  detail: string;
  code: string | null;
  resources: DailyTopicResource[];
}

export function DailyTopicButton({ isAdmin }: { isAdmin: boolean }) {
  const [topic, setTopic] = useState<DailyTopic | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/daily-topic")
      .then((r) => (r.ok ? r.json() : { topic: null }))
      .then((data) => {
        if (active) setTopic(data.topic ?? null);
      })
      .catch(() => {})
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  async function regenerate() {
    setRegenerating(true);
    setError("");
    try {
      const res = await fetch("/api/daily-topic/regenerate", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.topic) {
        setTopic(data.topic);
      } else {
        setError(data?.error?.message || "Couldn't fetch a new topic.");
      }
    } finally {
      setRegenerating(false);
    }
  }

  // Nothing to show until we know there's a topic (keeps the header clean if
  // generation is unavailable).
  if (!loaded || !topic) return null;

  const kindLabel = topic.kind === "problem" ? "Problem" : "Concept";
  const paragraphs = topic.detail
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-center rounded-full border border-border bg-card px-3 py-1.5 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-muted"
      >
        <span aria-hidden className="text-base leading-none">
          💡
        </span>
        <span className="font-medium">Topic of the day</span>
        <span className="hidden text-muted-foreground sm:inline">
          · {topic.category}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Topic of the day
              </span>
              <Badge variant="secondary">{kindLabel}</Badge>
              <Badge variant="outline">{topic.category}</Badge>
            </div>
            <DialogTitle className="text-lg">{topic.title}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">{topic.summary}</p>

            <div className="space-y-2 text-[13px] leading-relaxed text-foreground/90">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {topic.code && (
              <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-[12px] leading-relaxed ring-1 ring-border">
                <code>{topic.code}</code>
              </pre>
            )}

            {topic.resources.length > 0 && (
              <div className="pt-1">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Learn more
                </p>
                <ul className="space-y-1">
                  {topic.resources.map((r, i) => (
                    <li key={i}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        {r.label}
                        <svg
                          className="size-3.5 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {isAdmin && (
            <div className="flex justify-end border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={regenerate}
                disabled={regenerating}
              >
                {regenerating ? "Generating…" : "🔄 Another topic"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
