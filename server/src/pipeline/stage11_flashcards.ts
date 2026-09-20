import { generateStructured } from "../llm/gemini.js";
import { FlashcardsResponseSchema } from "../llm/schemas.js";
import { SECURITY_PREAMBLE } from "../llm/prompts/shared.js";
import type { Requirement } from "../validation/kitSchema.js";

export interface FlashcardDraft {
  front: string;
  back: string;
  requirement_ids: string[];
}

/**
 * Stage 11: flashcards, one call covering all requirements at once (unlike
 * questions, flashcards don't need category-specific instructions — a
 * front/back recall card is the same shape whether it's testing a technical
 * fact or a behavioural principle).
 */
export async function generateFlashcards(requirements: Requirement[]): Promise<FlashcardDraft[]> {
  if (requirements.length === 0) return [];

  const reqList = requirements.map((r) => `- id="${r.id}" [${r.kind}/${r.priority}] ${r.text}`).join("\n");

  const system = `${SECURITY_PREAMBLE}

Write concise flashcards (front = a short prompt/question, back = a short, concrete answer or set of key points) that help someone drill the requirements below before an interview. One to two flashcards per requirement, weighted toward "must" priority. Keep the back of each card brief — a few sentences or a short bullet list, not an essay. Every flashcard's requirement_ids must only reference ids from the list, never invent new ones.`;

  const prompt = `Requirements:
${reqList}

Return JSON: {"flashcards":[{"front":string,"back":string,"requirement_ids":string[]}]}`;

  const result = await generateStructured(system, prompt, FlashcardsResponseSchema);
  const validIds = new Set(requirements.map((r) => r.id));

  return result.flashcards
    .map((f) => ({ ...f, requirement_ids: f.requirement_ids.filter((id) => validIds.has(id)) }))
    .filter((f) => f.requirement_ids.length > 0);
}
