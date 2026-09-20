import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { validateBody } from "../middleware/validate.js";
import { CreateFlashcardSchema, ReorderQuestionsSchema, UpdateFlashcardSchema } from "../validation/requestSchemas.js";
import { loadOwnedKit, saveValidatedKit } from "../services/kitAccess.js";
import { IdAllocator } from "../pipeline/idAllocator.js";
import type { Flashcard } from "../validation/kitSchema.js";

export const kitFlashcardsRouter = Router();
kitFlashcardsRouter.use(requireAuth);

function notFound(res: import("express").Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or not yet generated" } });
}

kitFlashcardsRouter.post("/:id/flashcards", validateBody(CreateFlashcardSchema), async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);

  const ids = new IdAllocator("f", kit.kit.flashcards.map((f) => f.id));
  const flashcard: Flashcard = { ...req.body, id: ids.next(), state: "pinned" };
  kit.kit.flashcards.push(flashcard);
  await saveValidatedKit(kit);
  res.status(201).json({ kit });
});

kitFlashcardsRouter.patch(
  "/:id/flashcards/:flashcardId",
  validateBody(UpdateFlashcardSchema),
  async (req: AuthedRequest, res) => {
    const kit = await loadOwnedKit(req.userId!, req.params.id);
    if (!kit || !kit.kit) return notFound(res);

    const flashcard = kit.kit.flashcards.find((f) => f.id === req.params.flashcardId);
    if (!flashcard) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
      return;
    }
    Object.assign(flashcard, req.body);
    if (flashcard.state === "generated") flashcard.state = "edited";
    await saveValidatedKit(kit);
    res.json({ kit });
  }
);

kitFlashcardsRouter.delete("/:id/flashcards/:flashcardId", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);

  kit.kit.flashcards = kit.kit.flashcards.filter((f) => f.id !== req.params.flashcardId);
  await saveValidatedKit(kit);
  res.json({ kit });
});

kitFlashcardsRouter.post(
  "/:id/flashcards/reorder",
  validateBody(ReorderQuestionsSchema),
  async (req: AuthedRequest, res) => {
    const kit = await loadOwnedKit(req.userId!, req.params.id);
    if (!kit || !kit.kit) return notFound(res);

    const { orderedIds } = req.body as { orderedIds: string[] };
    const byId = new Map(kit.kit.flashcards.map((f) => [f.id, f]));
    if (orderedIds.length !== byId.size || !orderedIds.every((id) => byId.has(id))) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "orderedIds must be a permutation of all existing flashcard ids" },
      });
      return;
    }
    kit.kit.flashcards = orderedIds.map((id) => byId.get(id)!);
    await saveValidatedKit(kit);
    res.json({ kit });
  }
);
