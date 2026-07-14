import { z } from "zod";
import { GRADE_VALUES } from "@/lib/grades";
import { ROLES } from "@/lib/roles";
import { normalizeCertCode } from "@/lib/certificates";

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

// ---- Certificates ----

export const createCertificateSchema = z.object({
  // Stored bare; the verify URL is derived. Codes are alphanumeric, e.g.
  // "5Y0FT4E8X7GG9F6T". A pasted verify URL is accepted too (trailing code is
  // extracted) and the result is uppercased before validating.
  code: z
    .string()
    .transform(normalizeCertCode)
    .pipe(
      z.string().regex(/^[A-Z0-9]{6,32}$/, "Code must be 6–32 letters and digits")
    ),
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
  // Cancellation is admin-only and goes through POST /assessments/[id]/cancel.
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]).optional(),
  optionalGuestEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
});

export const cancelAssessmentSchema = z.object({
  reason: z.string().trim().min(1, "A cancellation reason is required"),
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
      score: z.number().int().min(0).max(10).nullable(),
      comment: z.string().optional(),
    })
  ),
});

export const updateCertificateSchema = z.object({
  pinned: z.boolean(),
});

export const roadmapProgressSchema = z.object({
  items: z.array(
    z.object({
      sectionId: z.string().min(1),
      topicId: z.string().min(1),
      grade: z.enum(["jun", "mid", "sen"]),
      // The full ticked set for this (topic, grade). Empty clears it.
      resolvedSkills: z.array(z.string()),
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

// ---- Session templates (admin-managed session generation) ----

const gradeBandEnum = z.enum(["jun", "mid", "sen"]);
const assessmentTypeEnum = z.enum(["GENERAL", "PDP_CHECK"]);

export const createSessionTemplateSchema = z.object({
  assessmentType: assessmentTypeEnum,
  gradeBand: gradeBandEnum,
  // Optional stable slug; derived from the title server-side when omitted.
  key: z.string().min(1).max(60).optional(),
  title: z.string().trim().min(1).max(100),
  order: z.number().int().min(0),
  durationMin: z.number().int().min(1).max(480),
  enabled: z.boolean().optional(),
});

export const patchSessionTemplateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  order: z.number().int().min(0).optional(),
  durationMin: z.number().int().min(1).max(480).optional(),
  enabled: z.boolean().optional(),
});

// ---- Tech matrix editing (admin-only) ----

const skillsArray = z.array(z.string().trim().min(1).max(300));

export const createSectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const patchSectionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
});

export const createTopicSchema = z.object({
  sectionId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
});

export const patchTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
  jun: skillsArray.optional(),
  mid: skillsArray.optional(),
  sen: skillsArray.optional(),
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

// Admin decision on an ended assessment: upgrade the subject's grade (admin
// picks the new grade) or record a no-upgrade decision.
export const assessmentReviewDecisionSchema = z
  .object({
    action: z.enum(["upgrade", "noUpgrade"]),
    newGrade: gradeEnum.optional(),
    reviewNotes: z.string().optional().nullable(),
  })
  .refine((d) => d.action !== "upgrade" || !!d.newGrade, {
    message: "newGrade is required when upgrading",
    path: ["newGrade"],
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
