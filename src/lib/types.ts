export type Grade = "jun" | "mid" | "sen";

export const GRADE_LABELS: Record<Grade, string> = {
  jun: "Junior",
  mid: "Middle",
  sen: "Senior",
};

export interface CategoryInfo {
  name: string;
  score: number | null;
  subtopics: string[];
  comment: string;
  selected?: boolean;
}

export interface EmployeeInfo {
  employee: string;
  date: string;
  level_before: string;
  project: string;
  manager: string;
  interviewer: string;
  grade: Grade;
  level_after?: string;
  next_date?: string;
  next_level?: string;
}

export interface PdpTopic {
  questions: string[];
  task: string;
}

export type PdpTopicsMap = Record<string, PdpTopic>;
export type TopicMapping = Record<string, string[]>;

export interface GenerateSettings {
  maxQuestions: number;
  threshold: number;
  outputName: string;
  includeTasks: boolean;
}

export interface ParseExcelResult {
  info: EmployeeInfo;
  categories: CategoryInfo[];
  sheets: string[];
}

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
