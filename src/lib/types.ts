/**
 * Base grade — collapses the +/- modifiers from `lib/grades.ts` into the
 * three buckets that drive matrix lookups and session templates.
 */
export type Grade = "jun" | "mid" | "sen";

export interface PdpTopic {
  questions: string[];
  task: string;
}

export type PdpTopicsMap = Record<string, PdpTopic>;
export type TopicMapping = Record<string, string[]>;

// Tech Matrix types
export interface TechMatrixTopic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}

export interface TechMatrixSection {
  id: string;
  title: string;
  topics: TechMatrixTopic[];
}

export interface TechMatrix {
  sections: TechMatrixSection[];
}
