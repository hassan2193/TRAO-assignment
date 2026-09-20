import type { PracticeLogEntry } from "../models/Kit.js";
import type { Flashcard, Kit } from "../validation/kitSchema.js";

interface CardState {
  flashcardId: string;
  lastConfidence: number | null;
  timesReviewed: number;
  lastReviewedAt: Date | null;
}

function computeCardStates(flashcards: Flashcard[], log: PracticeLogEntry[]): CardState[] {
  const byCard = new Map<string, PracticeLogEntry[]>();
  for (const entry of log) {
    const list = byCard.get(entry.flashcardId) ?? [];
    list.push(entry);
    byCard.set(entry.flashcardId, list);
  }

  return flashcards.map((f) => {
    const entries = (byCard.get(f.id) ?? []).slice().sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
    const last = entries.at(-1);
    return {
      flashcardId: f.id,
      lastConfidence: last?.confidence ?? null,
      timesReviewed: entries.length,
      lastReviewedAt: last?.reviewedAt ?? null,
    };
  });
}

/**
 * Confidence-weighted ordering for the next practice session: cards never
 * reviewed are treated as maximally weak (rank 0, ahead of even a "low
 * confidence" review), then ascending by last recorded confidence, then by
 * how long it's been since the card was last seen. Simple and explainable
 * — a full spaced-repetition interval scheduler is more than this brief
 * asks for, and confidence self-report is a fine enough proxy for a short
 * interview-prep timeframe. See README for the trade-off discussion.
 */
export function orderFlashcardsByWeakness(flashcards: Flashcard[], log: PracticeLogEntry[]) {
  const states = computeCardStates(flashcards, log);
  const byId = new Map(states.map((s) => [s.flashcardId, s]));

  return flashcards
    .map((f) => ({ flashcard: f, state: byId.get(f.id)! }))
    .sort((a, b) => {
      const rankA = a.state.lastConfidence ?? 0;
      const rankB = b.state.lastConfidence ?? 0;
      if (rankA !== rankB) return rankA - rankB;
      const timeA = a.state.lastReviewedAt?.getTime() ?? 0;
      const timeB = b.state.lastReviewedAt?.getTime() ?? 0;
      return timeA - timeB;
    })
    .map(({ flashcard, state }) => ({
      ...flashcard,
      lastConfidence: state.lastConfidence,
      timesReviewed: state.timesReviewed,
      covered: state.timesReviewed > 0,
    }));
}

export function summarizePracticeCoverage(flashcards: Flashcard[], log: PracticeLogEntry[]) {
  const states = computeCardStates(flashcards, log);
  const covered = states.filter((s) => s.timesReviewed > 0);
  return {
    total: flashcards.length,
    covered: covered.length,
    notCovered: flashcards.length - covered.length,
    averageConfidence: covered.length
      ? Number((covered.reduce((sum, s) => sum + (s.lastConfidence ?? 0), 0) / covered.length).toFixed(2))
      : null,
  };
}

export interface WeakSpotsReport {
  weakRequirements: { id: string; text: string; priority: string; reason: string; averageConfidence: number | null }[];
  weakFlashcards: { id: string; front: string; lastConfidence: number | null; covered: boolean }[];
  uncoveredMustHaves: { id: string; text: string }[];
  recommendation: string;
}

/**
 * Creative feature: a "weak spots" report. Combines two honest signals —
 * requirements the question bank never covered (from the deterministic
 * coverage check) and requirements whose flashcards the user has practiced
 * but rated low-confidence — into one prioritized revision list.
 */
export function buildWeakSpotsReport(kit: Kit, log: PracticeLogEntry[]): WeakSpotsReport {
  const cardStates = computeCardStates(kit.flashcards, log);
  const stateById = new Map(cardStates.map((s) => [s.flashcardId, s]));

  const confidenceByRequirement = new Map<string, number[]>();
  for (const card of kit.flashcards) {
    const state = stateById.get(card.id);
    if (!state || state.lastConfidence === null) continue;
    for (const rid of card.requirement_ids) {
      const list = confidenceByRequirement.get(rid) ?? [];
      list.push(state.lastConfidence);
      confidenceByRequirement.set(rid, list);
    }
  }

  const uncoveredSet = new Set(kit.coverage.uncovered_requirement_ids);
  const weakRequirements: WeakSpotsReport["weakRequirements"] = [];

  for (const req of kit.role.requirements) {
    const confidences = confidenceByRequirement.get(req.id) ?? [];
    const avg = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

    if (uncoveredSet.has(req.id)) {
      weakRequirements.push({
        id: req.id,
        text: req.text,
        priority: req.priority,
        reason: "No question in the kit covers this requirement yet.",
        averageConfidence: avg,
      });
    } else if (avg !== null && avg <= 1.5) {
      weakRequirements.push({
        id: req.id,
        text: req.text,
        priority: req.priority,
        reason: "Low self-reported confidence across practiced flashcards.",
        averageConfidence: avg,
      });
    }
  }

  weakRequirements.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "must" ? -1 : 1;
    return (a.averageConfidence ?? 0) - (b.averageConfidence ?? 0);
  });

  const weakFlashcards = kit.flashcards
    .map((f) => ({ id: f.id, front: f.front, lastConfidence: stateById.get(f.id)?.lastConfidence ?? null, covered: (stateById.get(f.id)?.timesReviewed ?? 0) > 0 }))
    .filter((f) => f.lastConfidence !== null && f.lastConfidence <= 1)
    .sort((a, b) => (a.lastConfidence ?? 0) - (b.lastConfidence ?? 0));

  const uncoveredMustHaves = kit.role.requirements
    .filter((r) => r.priority === "must" && uncoveredSet.has(r.id))
    .map((r) => ({ id: r.id, text: r.text }));

  const recommendation = weakRequirements.length
    ? `Focus your remaining prep time on ${weakRequirements.length} weak area${weakRequirements.length === 1 ? "" : "s"}, starting with must-have requirements.`
    : "No weak spots detected yet — practice more flashcards to get a signal, or you're in good shape.";

  return { weakRequirements, weakFlashcards, uncoveredMustHaves, recommendation };
}
