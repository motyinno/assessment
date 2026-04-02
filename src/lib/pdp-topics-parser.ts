import type { PdpTopicsMap } from "./types";

/**
 * Parse PDP topics from Markdown content (converted from .docx by mammoth).
 */
export function parsePdpTopicsMd(md: string): PdpTopicsMap {
  const topics: PdpTopicsMap = {};

  // Try both __Header__ and **Header** patterns; use whichever produces more sections
  const parts1 = md.split(/\n__([^_]+(?:__)?)\s*(?:\\\\)?\s*\n_?_?\s*\n?/);
  const parts2 = md.split(/\n\*\*([^*]+(?:\*\*)?)\s*(?:\\\\)?\s*\n\*?\*?\s*\n?/);
  const allParts = parts1.length > parts2.length ? parts1 : parts2;

  for (let i = 1; i < allParts.length; i += 2) {
    const header = allParts[i].trim().replace(/[_*]+$/g, "").trim();
    const body = allParts[i + 1] || "";
    if (!header || header.startsWith("Task")) continue;

    const questions: string[] = [];
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        let q = trimmed
          .replace(/^[-*]\s+/, "")
          .replace(/^>\s*/, "")
          .trim();
        q = q
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/__(.+?)__/g, "$1")
          .replace(/_(.+?)_/g, "$1")
          .replace(/\\/g, "");
        if (q.length > 10) questions.push(q);
      }
    }

    let task = "";
    const taskMatch =
      body.match(/\*\*Task:\*\*\s*(.+?)(?:\n\*\*|$)/s) ||
      body.match(/__Task:__\s*(.+?)(?:\n__|$)/s);
    if (taskMatch) {
      task = taskMatch[1]
        .trim()
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/\\/g, "")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    topics[header] = { questions, task };
  }

  return topics;
}

/**
 * Select up to maxQ questions from matched PDP topic headers.
 */
export function selectQuestions(
  pdpTopics: PdpTopicsMap,
  matchedHeaders: string[],
  maxQ: number = 2
): { questions: string[]; task: string } {
  let allQ: string[] = [];
  let task = "";

  for (const h of matchedHeaders) {
    for (const [ph, data] of Object.entries(pdpTopics)) {
      if (ph.toLowerCase().trim() === h.toLowerCase().trim()) {
        allQ.push(...data.questions);
        if (data.task && !task) task = data.task;
        break;
      }
    }
  }

  const selected: string[] = [];
  if (allQ.length > 0) {
    const step = Math.max(1, Math.floor(allQ.length / maxQ));
    for (let i = 0; i < allQ.length && selected.length < maxQ; i += step) {
      selected.push(allQ[i]);
    }
  }

  return { questions: selected, task };
}
