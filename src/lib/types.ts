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
  grade: "jun" | "mid";
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
