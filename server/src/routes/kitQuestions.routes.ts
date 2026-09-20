import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { validateBody } from "../middleware/validate.js";
import {
  CreateQuestionSchema,
  ReorderQuestionsSchema,
  UpdateQuestionSchema,
} from "../validation/requestSchemas.js";
import { loadOwnedKit, saveValidatedKit } from "../services/kitAccess.js";
import { rebuildSchedule } from "../services/generationRunner.js";
import { IdAllocator } from "../pipeline/idAllocator.js";
import {
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateSystemDesignQuestions,
  generateTechnicalQuestions,
} from "../pipeline/stage10_questionGeneration.js";
import type { Question, QuestionCategory } from "../validation/kitSchema.js";

export const kitQuestionsRouter = Router();
kitQuestionsRouter.use(requireAuth);

function notFound(res: import("express").Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or not yet generated" } });
}

kitQuestionsRouter.post("/:id/questions", validateBody(CreateQuestionSchema), async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);

  const ids = new IdAllocator("q", kit.kit.questions.map((q) => q.id));
  const question: Question = { ...req.body, id: ids.next(), state: "pinned" };
  kit.kit.questions.push(question);
  kit.kit.schedule = rebuildSchedule(kit.kit.role.requirements, kit.kit.questions, kit.kit.schedule.days_available);
  await saveValidatedKit(kit);
  res.status(201).json({ kit });
});

kitQuestionsRouter.patch(
  "/:id/questions/:questionId",
  validateBody(UpdateQuestionSchema),
  async (req: AuthedRequest, res) => {
    const kit = await loadOwnedKit(req.userId!, req.params.id);
    if (!kit || !kit.kit) return notFound(res);

    const question = kit.kit.questions.find((q) => q.id === req.params.questionId);
    if (!question) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });
      return;
    }
    Object.assign(question, req.body);
    if (question.state === "generated") question.state = "edited";
    await saveValidatedKit(kit);
    res.json({ kit });
  }
);

kitQuestionsRouter.delete("/:id/questions/:questionId", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);

  kit.kit.questions = kit.kit.questions.filter((q) => q.id !== req.params.questionId);
  kit.kit.schedule = rebuildSchedule(kit.kit.role.requirements, kit.kit.questions, kit.kit.schedule.days_available);
  await saveValidatedKit(kit);
  res.json({ kit });
});

kitQuestionsRouter.post(
  "/:id/questions/reorder",
  validateBody(ReorderQuestionsSchema),
  async (req: AuthedRequest, res) => {
    const kit = await loadOwnedKit(req.userId!, req.params.id);
    if (!kit || !kit.kit) return notFound(res);

    const { orderedIds } = req.body as { orderedIds: string[] };
    const byId = new Map(kit.kit.questions.map((q) => [q.id, q]));
    if (orderedIds.length !== byId.size || !orderedIds.every((id) => byId.has(id))) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "orderedIds must be a permutation of all existing question ids" },
      });
      return;
    }
    kit.kit.questions = orderedIds.map((id) => byId.get(id)!);
    await saveValidatedKit(kit);
    res.json({ kit });
  }
);

const CATEGORY_GENERATORS: Record<QuestionCategory, "technical" | "behavioural" | "system-design" | "company-fit"> = {
  technical: "technical",
  behavioural: "behavioural",
  "system-design": "system-design",
  "company-fit": "company-fit",
};

kitQuestionsRouter.post("/:id/regenerate/questions/:category", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) return notFound(res);

  const category = req.params.category as QuestionCategory;
  if (!CATEGORY_GENERATORS[category]) {
    res.status(400).json({ error: { code: "INVALID_CATEGORY", message: `Unknown question category ${category}` } });
    return;
  }

  // Regenerating a category must not discard hand-edited/hand-added
  // questions: keep everything the user touched (edited/pinned) in that
  // category, drop only the machine-"generated" ones, then top up with a
  // fresh batch.
  const preserved = kit.kit.questions.filter((q) => !(q.category === category && q.state === "generated"));
  const otherQuestions = kit.kit.questions.filter((q) => q.category !== category);
  const preservedInCategory = preserved.filter((q) => q.category === category);

  try {
    let drafts;
    if (category === "technical") drafts = await generateTechnicalQuestions(kit.kit.role.requirements);
    else if (category === "behavioural") drafts = await generateBehaviouralQuestions(kit.kit.role.requirements);
    else if (category === "system-design")
      drafts = await generateSystemDesignQuestions(kit.kit.role.requirements, {
        title: kit.kit.role.title,
        seniority: kit.kit.role.seniority,
      });
    else
      drafts = await generateCompanyFitQuestions(kit.kit.role.requirements, {
        companyBrief: kit.kit.company_brief,
        hiringInsights: { found: false, summary: "", sources: [] },
        publicDiscussion: { found: false, summary: "", sources: [] },
      });

    const ids = new IdAllocator("q", kit.kit.questions.map((q) => q.id));
    const fresh: Question[] = drafts.map((d) => ({ ...d, id: ids.next(), state: "generated" as const }));

    kit.kit.questions = [...otherQuestions, ...preservedInCategory, ...fresh];
    kit.kit.schedule = rebuildSchedule(kit.kit.role.requirements, kit.kit.questions, kit.kit.schedule.days_available);
    await saveValidatedKit(kit);
    res.json({ kit });
  } catch (err) {
    res.status(502).json({ error: { code: "REGENERATE_QUESTIONS_FAILED", message: (err as Error).message } });
  }
});
