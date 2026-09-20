import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { validateBody } from "../middleware/validate.js";
import { PracticeRecordSchema } from "../validation/requestSchemas.js";
import { loadOwnedKit } from "../services/kitAccess.js";
import { buildWeakSpotsReport, orderFlashcardsByWeakness, summarizePracticeCoverage } from "../services/practice.js";

export const kitPracticeRouter = Router();
kitPracticeRouter.use(requireAuth);

function notFound(res: import("express").Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or not yet generated" } });
}

kitPracticeRouter.post(
  "/:id/practice/:flashcardId",
  validateBody(PracticeRecordSchema),
  async (req: AuthedRequest, res) => {
    const kit = await loadOwnedKit(req.userId!, req.params.id);
    if (!kit || !kit.kit) return notFound(res);

    const exists = kit.kit.flashcards.some((f) => f.id === req.params.flashcardId);
    if (!exists) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
      return;
    }

    kit.practiceLog.push({
      flashcardId: req.params.flashcardId,
      confidence: req.body.confidence,
      reviewedAt: new Date(),
    });
    await kit.save();
    res.status(201).json({ summary: summarizePracticeCoverage(kit.kit.flashcards, kit.practiceLog) });
  }
);

kitPracticeRouter.get("/:id/practice/session", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);
  res.json({ flashcards: orderFlashcardsByWeakness(kit.kit.flashcards, kit.practiceLog) });
});

kitPracticeRouter.get("/:id/practice/summary", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);
  res.json({ summary: summarizePracticeCoverage(kit.kit.flashcards, kit.practiceLog) });
});

kitPracticeRouter.get("/:id/weak-spots", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);
  res.json({ report: buildWeakSpotsReport(kit.kit, kit.practiceLog) });
});
