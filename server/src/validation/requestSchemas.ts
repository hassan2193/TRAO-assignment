import { z } from "zod";
import { QuestionCategory, RequirementKind, RequirementPriority } from "./kitSchema.js";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const CreateKitSchema = z.object({
  jd: z.string().min(1, "Job description is required"),
  companyUrl: z.string().min(1, "Company URL is required"),
  days: z.number().int().min(1).max(365),
});

export const CreateKitsBatchSchema = z.object({
  cases: z.array(CreateKitSchema).min(1).max(50),
});

export const UpdateQuestionSchema = z.object({
  prompt: z.string().min(1).optional(),
  answer_outline: z.string().optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  category: QuestionCategory.optional(),
  requirement_ids: z.array(z.string()).optional(),
});

export const CreateQuestionSchema = z.object({
  prompt: z.string().min(1),
  answer_outline: z.string().default(""),
  difficulty: z.number().int().min(1).max(3).default(2),
  category: QuestionCategory,
  requirement_ids: z.array(z.string()).default([]),
});

export const ReorderQuestionsSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export const UpdateFlashcardSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().optional(),
  requirement_ids: z.array(z.string()).optional(),
});

export const CreateFlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().default(""),
  requirement_ids: z.array(z.string()).default([]),
});

export const UpdateCompanyBriefSchema = z.object({
  summary: z.string().optional(),
  what_they_do: z.string().optional(),
});

export const UpdateRoleSchema = z.object({
  title: z.string().optional(),
  seniority: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
});

export const CreateRequirementSchema = z.object({
  text: z.string().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
});

export const UpdateRequirementSchema = z.object({
  text: z.string().min(1).optional(),
  kind: RequirementKind.optional(),
  priority: RequirementPriority.optional(),
});

export const PracticeRecordSchema = z.object({
  confidence: z.number().int().min(1).max(3),
});
