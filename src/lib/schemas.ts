import { z } from "zod";
import { GRADE_VALUES } from "@/lib/grades";
import { ROLES } from "@/lib/roles";

const gradeEnum = z.enum(GRADE_VALUES as unknown as readonly [string, ...string[]]);
const roleEnum = z.enum(ROLES as unknown as readonly [string, ...string[]]);

// ---- Users ----

export const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: roleEnum.optional(),
  grade: z.union([gradeEnum, z.literal(""), z.null()]).optional(),
  project: z.string().max(200).optional().nullable(),
  managerId: z.string().min(1).optional().nullable(),
});

export const patchUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  grade: z.union([gradeEnum, z.literal(""), z.null()]).optional(),
  project: z.string().optional().nullable(),
  managerId: z.string().nullable().optional(),
  role: roleEnum.optional(),
});

// ---- Assessments ----

export const participantInputSchema = z.object({
  userId: z.string().min(1),
  participantRole: z.enum(["SUBJECT", "ASSESSOR"]),
  assignedSections: z.array(z.string()).optional(),
});

export const createAssessmentSchema = z.object({
  title: z.string().min(1).max(300),
  grade: gradeEnum,
  scheduledAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  optionalGuestEmail: z.string().email().optional().nullable(),
  participants: z.array(participantInputSchema).optional(),
});

export const patchAssessmentSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional().nullable(),
  aiFeedback: z.string().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  optionalGuestEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
});

export const addParticipantSchema = z.object({
  userId: z.string().min(1),
  participantRole: z.enum(["SUBJECT", "ASSESSOR"]),
  assignedSections: z.array(z.string()).optional(),
});

export const resultsBatchSchema = z.object({
  results: z.array(
    z.object({
      category: z.string().min(1),
      score: z.number().nullable(),
      comment: z.string().optional(),
      subtopics: z.array(z.string()).optional(),
    })
  ),
});

export const selfAssessmentSchema = z.object({
  items: z.array(
    z.object({
      sectionId: z.string().min(1),
      topicId: z.string().min(1),
      score: z.number().int().min(1).max(5).nullable(),
      comment: z.string().optional(),
    })
  ),
});

export const sessionPatchSchema = z.object({
  sessionId: z.string().min(1),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "SKIPPED"]).optional(),
  notes: z.string().optional().nullable(),
  recordingLink: z.string().optional().nullable(),
  meetingLink: z.string().optional().nullable(),
});

export const meetingScheduleSchema = z.object({
  sessionId: z.string().min(1),
  startsAt: z.string().datetime(),
});

// ---- Assessment requests ----

export const createRequestSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const patchRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  assessorIds: z.array(z.string().min(1)).optional(),
  assessorId: z.string().optional(),
  adminNotes: z.string().optional().nullable(),
  assessmentType: z.enum(["GENERAL", "PDP_CHECK"]).optional(),
});

// ---- PDPs ----

export const generatePdpSchema = z.object({
  topicIds: z.array(z.string().min(1)).min(1),
});

export const attachPdpSchema = z.object({
  driveLink: z.string().min(1),
  fileName: z.string().optional(),
});

export const reviewPdpSchema = z.object({
  action: z.enum(["approve", "comment"]),
  reviewNotes: z.string().optional(),
});

// ---- AI feedback / generate ----

export const generateBodySchema = z.object({
  weakTopics: z.array(
    z.object({
      name: z.string(),
      score: z.number().nullable(),
      subtopics: z.array(z.string()),
      comment: z.string(),
      selected: z.boolean().optional(),
    })
  ),
  info: z.object({
    employee: z.string(),
    date: z.string().optional().default(""),
    level_before: z.string().optional().default(""),
    project: z.string().optional().default(""),
    manager: z.string().optional().default(""),
    interviewer: z.string().optional().default(""),
    grade: gradeEnum,
    level_after: z.string().optional(),
    next_date: z.string().optional(),
    next_level: z.string().optional(),
  }),
  settings: z.object({
    maxQuestions: z.number().int().min(1).max(10),
    threshold: z.number(),
    outputName: z.string(),
    includeTasks: z.boolean(),
  }),
  useAI: z.boolean().optional().default(false),
  assessmentId: z.string().optional(),
});
