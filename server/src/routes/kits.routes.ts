import { Router } from "express";
import { KitModel } from "../models/Kit.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { validateBody } from "../middleware/validate.js";
import { CreateKitSchema, CreateKitsBatchSchema, UpdateCompanyBriefSchema, UpdateRoleSchema } from "../validation/requestSchemas.js";
import { fingerprintCase } from "../services/hash.js";
import { loadOwnedKit, saveValidatedKit } from "../services/kitAccess.js";
import { runGenerationForKit, rebuildSchedule } from "../services/generationRunner.js";
import { crawlSite } from "../pipeline/crawler.js";
import { researchHiringProcess } from "../pipeline/stage6_hiringResearch.js";
import { researchPublicDiscussion } from "../pipeline/stage7_publicDiscussion.js";
import { generateCompanyBrief } from "../pipeline/stage8_companyBrief.js";
import { deriveCompanyName } from "../pipeline/companyName.js";
import { assertSafeUrl } from "../services/urlSafety.js";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);

function summarize(kit: InstanceType<typeof KitModel>) {
  return {
    id: kit.id,
    status: kit.status,
    company: kit.kit?.source?.company ?? null,
    role: kit.kit?.source?.role ?? kit.input.jd.slice(0, 60),
    days: kit.input.days,
    createdAt: kit.createdAt,
    updatedAt: kit.updatedAt,
    error: kit.error ?? null,
  };
}

kitsRouter.get("/", async (req: AuthedRequest, res) => {
  const kits = await KitModel.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ kits: kits.map(summarize) });
});

async function createOneKit(userId: string, input: { jd: string; companyUrl: string; days: number }) {
  const fingerprint = fingerprintCase(input.jd, input.companyUrl, input.days);
  const existing = await KitModel.findOne({ userId, fingerprint });
  if (existing) return { kit: existing, deduped: true };
  const kit = await KitModel.create({ userId, input, fingerprint, status: "pending" });
  return { kit, deduped: false };
}

kitsRouter.post("/", validateBody(CreateKitSchema), async (req: AuthedRequest, res) => {
  const { kit, deduped } = await createOneKit(req.userId!, req.body);
  res.status(deduped ? 200 : 201).json({ kit: summarize(kit), deduped });
});

// Batch upload of description-and-company pairs from the "prepare for more
// than one role" flow in the UI (distinct from the mandatory CLI batch
// entry point in scripts/evaluate.ts, which is unauthenticated and used for
// grading — this one just creates several pending kit records for the
// signed-in user, which the frontend then triggers generation for).
kitsRouter.post("/batch", validateBody(CreateKitsBatchSchema), async (req: AuthedRequest, res) => {
  const { cases } = req.body as { cases: { jd: string; companyUrl: string; days: number }[] };
  const results = await Promise.all(cases.map((c) => createOneKit(req.userId!, c)));
  res.status(201).json({ kits: results.map((r) => summarize(r.kit)) });
});

kitsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
    return;
  }
  res.json({ kit });
});

kitsRouter.patch(
  "/:id",
  async (req: AuthedRequest, res) => {
    const kit = await loadOwnedKit(req.userId!, req.params.id);
    if (!kit || !kit.kit) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or not yet generated" } });
      return;
    }

    const briefParsed = UpdateCompanyBriefSchema.safeParse(req.body.company_brief ?? {});
    const roleParsed = UpdateRoleSchema.safeParse(req.body.role ?? {});
    if (!briefParsed.success || !roleParsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid update payload" } });
      return;
    }

    kit.kit.company_brief = { ...kit.kit.company_brief, ...briefParsed.data };
    kit.kit.role = { ...kit.kit.role, ...roleParsed.data };
    await saveValidatedKit(kit);
    res.json({ kit });
  }
);

kitsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
    return;
  }
  await kit.deleteOne();
  res.status(204).send();
});

kitsRouter.post("/:id/generate", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
    return;
  }
  if (kit.status === "generating") {
    res.status(409).json({ error: { code: "ALREADY_GENERATING", message: "This kit is already generating" } });
    return;
  }
  res.status(202).json({ status: "generating" });
  void runGenerationForKit(kit.id);
});

kitsRouter.get("/:id/generation-status", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
    return;
  }
  res.json({
    status: kit.status,
    progressEvents: kit.progressEvents,
    warnings: kit.warnings,
    error: kit.error,
  });
});

kitsRouter.post("/:id/regenerate/company", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or not yet generated" } });
    return;
  }

  try {
    await assertSafeUrl(kit.input.companyUrl);
    const crawl = await crawlSite(kit.input.companyUrl);
    const [hiring, publicDiscussion, brief] = await Promise.all([
      researchHiringProcess(crawl.pages),
      researchPublicDiscussion(deriveCompanyName(crawl.pages[0]?.title ?? "", kit.input.companyUrl)),
      generateCompanyBrief(crawl.pages),
    ]);

    kit.kit.company_brief = brief;
    kit.kit.source.company = deriveCompanyName(crawl.pages[0]?.title ?? "", kit.input.companyUrl);
    kit.kit.source.pages_used = crawl.pages.map((p) => p.url);
    kit.kit.source.researched_at = new Date().toISOString();
    await saveValidatedKit(kit);
    res.json({ kit, hiringInsights: hiring, publicDiscussion });
  } catch (err) {
    res.status(502).json({ error: { code: "REGENERATE_COMPANY_FAILED", message: (err as Error).message } });
  }
});

kitsRouter.post("/:id/regenerate/schedule", async (req: AuthedRequest, res) => {
  const kit = await loadOwnedKit(req.userId!, req.params.id);
  if (!kit || !kit.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or not yet generated" } });
    return;
  }
  const days = typeof req.body?.days === "number" ? req.body.days : kit.kit.schedule.days_available;
  kit.kit.schedule = rebuildSchedule(kit.kit.role.requirements, kit.kit.questions, days);
  await saveValidatedKit(kit);
  res.json({ kit });
});
