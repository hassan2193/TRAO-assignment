import { z } from "zod";

/**
 * Appendix A structure, field-for-field. Names and nesting must match the
 * assessment brief exactly — this schema is the single source of truth for
 * both TypeScript types (via z.infer) and runtime validation.
 */

export const RequirementKind = z.enum(["technical", "behavioural", "domain"]);
export type RequirementKind = z.infer<typeof RequirementKind>;
export const RequirementPriority = z.enum(["must", "nice"]);
export type RequirementPriority = z.infer<typeof RequirementPriority>;
export const QuestionCategory = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
export type QuestionCategory = z.infer<typeof QuestionCategory>;

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)),
  category: QuestionCategory,
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
  // Builder state: tracks whether the user hand-edited/added this question
  // so that section regeneration can preserve it. Extension beyond Appendix A.
  state: z.enum(["generated", "edited", "pinned"]).default("generated"),
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string(),
  requirement_ids: z.array(z.string().min(1)),
  state: z.enum(["generated", "edited", "pinned"]).default("generated"),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string().min(1)),
  minutes: z.number().int().min(0),
});

export const ScheduleSchema = z.object({
  days_available: z.number().int().min(1),
  days: z.array(ScheduleDaySchema),
});

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().min(0),
});

export const SourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().min(0),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});

export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const RoleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema),
});

export const KitSchema = z
  .object({
    source: SourceSchema,
    company_brief: CompanyBriefSchema,
    role: RoleSchema,
    questions: z.array(QuestionSchema),
    flashcards: z.array(FlashcardSchema),
    schedule: ScheduleSchema,
    coverage: CoverageSchema,
  })
  .superRefine((kit, ctx) => {
    const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
    const questionIds = new Set(kit.questions.map((q) => q.id));

    if (requirementIds.size !== kit.role.requirements.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Requirement ids must be unique within the kit",
        path: ["role", "requirements"],
      });
    }
    if (questionIds.size !== kit.questions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Question ids must be unique within the kit",
        path: ["questions"],
      });
    }

    kit.questions.forEach((q, i) => {
      q.requirement_ids.forEach((rid) => {
        if (!requirementIds.has(rid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question ${q.id} references unknown requirement id ${rid}`,
            path: ["questions", i, "requirement_ids"],
          });
        }
      });
    });

    kit.flashcards.forEach((f, i) => {
      f.requirement_ids.forEach((rid) => {
        if (!requirementIds.has(rid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Flashcard ${f.id} references unknown requirement id ${rid}`,
            path: ["flashcards", i, "requirement_ids"],
          });
        }
      });
    });

    kit.schedule.days.forEach((day, i) => {
      day.question_ids.forEach((qid) => {
        if (!questionIds.has(qid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Schedule day ${day.day} references unknown question id ${qid}`,
            path: ["schedule", "days", i, "question_ids"],
          });
        }
      });
    });

    kit.coverage.uncovered_requirement_ids.forEach((rid) => {
      if (!requirementIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage references unknown requirement id ${rid}`,
          path: ["coverage", "uncovered_requirement_ids"],
        });
      }
    });
  });

export type Kit = z.infer<typeof KitSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;
export type Role = z.infer<typeof RoleSchema>;

export interface KitValidationResult {
  valid: boolean;
  errors: string[];
  kit: Kit | null;
}

export function validateKit(candidate: unknown): KitValidationResult {
  const result = KitSchema.safeParse(candidate);
  if (result.success) {
    return { valid: true, errors: [], kit: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    ),
    kit: null,
  };
}
