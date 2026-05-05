export const GRADE_VALUES = [
  "Trainee",
  "Intern",
  "jun-",
  "jun",
  "jun+",
  "mid-",
  "mid",
  "mid+",
  "sen-",
  "sen",
  "sen+",
] as const;

export type Grade = (typeof GRADE_VALUES)[number];

export const GRADE_LABELS: Record<string, string> = {
  Trainee: "Trainee",
  Intern: "Intern",
  "jun-": "Junior-",
  jun: "Junior",
  "jun+": "Junior+",
  "mid-": "Middle-",
  mid: "Middle",
  "mid+": "Middle+",
  "sen-": "Senior-",
  sen: "Senior",
  "sen+": "Senior+",
};

/**
 * Strip +/- modifier from a grade to the base grade used by session-building
 * and tech-matrix topic filtering (jun/mid/sen). Trainee and Intern are
 * treated as Junior for assessment purposes.
 */
export function baseGrade(grade: string | null | undefined): "jun" | "mid" | "sen" {
  if (!grade) return "jun";
  if (grade === "Trainee" || grade === "Intern") return "jun";
  const stripped = grade.replace(/[+\-]$/, "");
  if (stripped === "jun" || stripped === "mid" || stripped === "sen") {
    return stripped;
  }
  return "jun";
}

export function gradeLabel(grade: string | null | undefined): string {
  if (!grade) return "—";
  return GRADE_LABELS[grade] ?? grade;
}

export function isValidGrade(grade: unknown): grade is Grade {
  return typeof grade === "string" && (GRADE_VALUES as readonly string[]).includes(grade);
}

/**
 * Numeric rank for a grade — higher = more senior. Returns -1 for unknown.
 * Use for ordering and "at least as senior as" comparisons.
 */
export function gradeRank(grade: string | null | undefined): number {
  if (!grade) return -1;
  return (GRADE_VALUES as readonly string[]).indexOf(grade);
}
