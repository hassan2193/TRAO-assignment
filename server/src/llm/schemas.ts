import { z } from "zod";
import { QuestionCategory, RequirementKind, RequirementPriority } from "../validation/kitSchema.js";

export const RawRequirementSchema = z.object({
  text: z.string().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
});

export const ExtractRequirementsResponseSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  location: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RawRequirementSchema),
});
export type ExtractRequirementsResponse = z.infer<typeof ExtractRequirementsResponseSchema>;

export const CompanyBriefResponseSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
});
export type CompanyBriefResponse = z.infer<typeof CompanyBriefResponseSchema>;

export const HiringInsightResponseSchema = z.object({
  found: z.boolean(),
  summary: z.string(),
});
export type HiringInsightResponse = z.infer<typeof HiringInsightResponseSchema>;

export const RawQuestionSchema = z.object({
  requirement_ids: z.array(z.string()),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

export const QuestionsResponseSchema = z.object({
  questions: z.array(RawQuestionSchema),
});
export type QuestionsResponse = z.infer<typeof QuestionsResponseSchema>;

export const RawFlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

export const FlashcardsResponseSchema = z.object({
  flashcards: z.array(RawFlashcardSchema),
});
export type FlashcardsResponse = z.infer<typeof FlashcardsResponseSchema>;

export { QuestionCategory };
