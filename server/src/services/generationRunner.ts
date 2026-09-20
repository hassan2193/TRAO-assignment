import { KitModel } from "../models/Kit.js";
import { runPipeline } from "../pipeline/orchestrator.js";
import { PipelineFatalError, type ProgressEvent } from "../pipeline/types.js";
import { buildSchedule } from "../pipeline/schedule.js";
import type { Question, Requirement, Schedule } from "../validation/kitSchema.js";

/**
 * Runs the shared pipeline for an already-created kit document and persists
 * progress as it goes, so the frontend can poll generation-status and show
 * real step-by-step progress instead of a spinner. Fire-and-forget from the
 * route handler's point of view — the route responds 202 immediately.
 */
export async function runGenerationForKit(kitId: string): Promise<void> {
  const kit = await KitModel.findById(kitId);
  if (!kit) return;

  kit.status = "generating";
  kit.progressEvents = [];
  kit.warnings = [];
  kit.error = null;
  await kit.save();

  const onProgress = (event: ProgressEvent) => {
    KitModel.findByIdAndUpdate(kitId, {
      $push: { progressEvents: { step: event.step, status: event.status, detail: event.detail, at: new Date() } },
    }).catch(() => {
      /* best-effort progress logging; generation result is what actually matters */
    });
  };

  try {
    const { kit: generatedKit, warnings } = await runPipeline(
      { jd: kit.input.jd, companyUrl: kit.input.companyUrl, days: kit.input.days },
      onProgress
    );
    await KitModel.findByIdAndUpdate(kitId, {
      status: "ready",
      kit: generatedKit,
      warnings,
      error: null,
    });
  } catch (err) {
    const code = err instanceof PipelineFatalError ? err.code : "UNKNOWN_ERROR";
    const message = (err as Error).message;
    await KitModel.findByIdAndUpdate(kitId, {
      status: "failed",
      error: { code, message },
    });
  }
}

/**
 * Rebuilds only the schedule from the kit's current questions/requirements.
 * Used after any change to the question set (add, delete, regenerate a
 * category) so schedule.question_ids never dangles, without touching
 * anything the user edited elsewhere.
 */
export function rebuildSchedule(requirements: Requirement[], questions: Question[], daysAvailable: number): Schedule {
  return buildSchedule(requirements, questions, daysAvailable);
}
