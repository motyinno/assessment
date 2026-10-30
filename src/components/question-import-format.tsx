"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * How to build an interview-questions/v1 file for the division on screen:
 * the example and the downloadable template use that division's real topic
 * ids and skills, since a question only attaches to a topic whose id matches.
 */

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

const FIELDS: Array<[string, string]> = [
  ["text", "The question, as a self-contained sentence (required)."],
  ["kind", "THEORY — knowledge you can study; EXPERIENCE — “how did you use X?”; BEHAVIORAL; BACKGROUND (required)."],
  ["topicId", "Id of a topic in this division's matrix (see the template). Unknown ids keep the question unattached."],
  ["skill", "Exact skill string of that topic, so the question counts towards the skill's “asked” tint."],
  ["band", "jun | mid | sen — the level the question targets."],
  ["timesAsked", "How many interviews it came up in (default 1). Repeats of a known question add up."],
  ["proposedTopic / proposedSkill", "What the matrix is missing, when no topic or skill fits."],
];

export function QuestionImportFormat({ divisionId, divisionName }: { divisionId: string; divisionName: string | null }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<MatrixSection[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !divisionId) return;
    setSections(null);
    fetch(`/api/tech-matrix?departmentId=${encodeURIComponent(divisionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sections?: MatrixSection[] } | null) => setSections(d?.sections ?? []));
  }, [open, divisionId]);

  const example = useMemo(() => {
    const topics = (sections ?? []).flatMap((s) => s.topics).filter((t) => t.jun.length || t.mid.length);
    const a = topics[0];
    const b = topics[1] ?? topics[0];
    return {
      schema: "interview-questions/v1",
      title: "Client interviews — October 2026",
      questions: [
        a
          ? { text: `Explain “${a.jun[0] ?? a.mid[0]}” and give an example.`, kind: "THEORY", topicId: a.id, skill: a.jun[0] ?? a.mid[0], band: a.jun[0] ? "jun" : "mid", timesAsked: 3 }
          : { text: "How does the event loop work in Node.js?", kind: "THEORY", topicId: "<topic id>", band: "jun", timesAsked: 3 },
        b
          ? { text: `Where did you apply ${b.title} on your last project?`, kind: "EXPERIENCE", topicId: b.id, band: "mid" }
          : { text: "How did you use message queues on your last project?", kind: "EXPERIENCE", topicId: "<topic id>", band: "mid" },
        { text: "How would you integrate several payment providers behind one API?", kind: "THEORY", band: "sen", proposedTopic: "Payments integration" },
        { text: "Tell us about a conflict in your team and how you resolved it.", kind: "BEHAVIORAL" },
      ],
    };
  }, [sections]);

  const exampleText = useMemo(() => JSON.stringify(example, null, 2), [example]);

  function downloadTemplate() {
    // The template carries the division's topics as a reference list; the
    // importer ignores keys it doesn't know, so it can be filled in place.
    const template = {
      ...example,
      division: divisionName,
      topics: (sections ?? []).flatMap((s) =>
        s.topics.map((t) => ({ topicId: t.id, section: s.title, title: t.title, skills: { jun: t.jun, mid: t.mid, sen: t.sen } }))
      ),
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-questions-template${divisionName ? `-${divisionName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(exampleText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (!open) {
    return (
      <button type="button" className="text-sm text-primary underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
        Import format and template
      </button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Import format · interview-questions/v1</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Questions go into <b className="text-foreground">{divisionName ?? "the selected division"}</b> and attach to its matrix by{" "}
            <code>topicId</code>. The import doesn&apos;t guess topics — set them in the file.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copy} disabled={!sections}>
            {copied ? "Copied" : "Copy example"}
          </Button>
          <Button size="sm" onClick={downloadTemplate} disabled={!sections}>
            Download template
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{sections ? exampleText : "Loading…"}</pre>
        <div className="space-y-2 text-sm">
          {FIELDS.map(([k, v]) => (
            <p key={k}>
              <code className="rounded bg-muted px-1 text-xs">{k}</code> <span className="text-muted-foreground">{v}</span>
            </p>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            The template also lists every topic id and skill of this division under <code>topics</code> — the import ignores that
            key, so you can fill <code>questions</code> right in the downloaded file.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
