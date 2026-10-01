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

/** The grade one step above, e.g. "mid" -> "mid+". Null at the top or for an unknown grade. */
export function nextGrade(grade: string | null | undefined): Grade | null {
  const rank = gradeRank(grade);
  return rank >= 0 ? GRADE_VALUES[rank + 1] ?? null : null;
}

/**
 * Assessments imported from the old Excel log (fixed `legacy_*` ids, see
 * migration 20260612135718_import_legacy_assessments) store the grade the
 * person was going for, not the one they had.
 */
function isLegacyAssessment(id: string): boolean {
  return id.startsWith("legacy_");
}

/**
 * The grade an assessment is going for, plus the subject's grade at the time
 * when we know it (for a tooltip). `Assessment.grade` is the subject's grade
 * when it was requested, so the target is one step above; at the top grade
 * (or an unknown one) there's nothing above, so it's the grade itself. Legacy
 * assessments already store the target, and their starting grade is unknown.
 */
export function assessmentTargetGrade(assessment: {
  id: string;
  grade: string | null | undefined;
}): { target: string; current: string | null } {
  const { id, grade } = assessment;
  if (isLegacyAssessment(id)) return { target: gradeLabel(grade), current: null };
  return { target: gradeLabel(nextGrade(grade) ?? grade), current: gradeLabel(grade) };
}
