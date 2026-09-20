import type { Question, Requirement } from "../validation/kitSchema.js";

/**
 * Deterministic coverage check: a requirement is "covered" if at least one
 * question references its id. This is plain application logic — never
 * delegated to the LLM, so it can't be talked out of an honest answer.
 */
export function findUncoveredRequirementIds(
  requirements: Requirement[],
  questions: Question[]
): string[] {
  const covered = new Set<string>();
  for (const q of questions) {
    for (const rid of q.requirement_ids) covered.add(rid);
  }
  return requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);
}

export function findUncoveredMustHaveIds(
  requirements: Requirement[],
  questions: Question[]
): string[] {
  const uncovered = new Set(findUncoveredRequirementIds(requirements, questions));
  return requirements
    .filter((r) => r.priority === "must" && uncovered.has(r.id))
    .map((r) => r.id);
}
