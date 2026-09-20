import { env } from "../config/env.js";
import { UnsafeUrlError, assertSafeUrl } from "../services/urlSafety.js";
import { crawlSite, type CrawledPage } from "./crawler.js";
import { researchHiringProcess } from "./stage6_hiringResearch.js";
import { researchPublicDiscussion } from "./stage7_publicDiscussion.js";
import { extractRequirements } from "./stage1_extractRequirements.js";
import { generateCompanyBrief } from "./stage8_companyBrief.js";
import {
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateSystemDesignQuestions,
  generateTechnicalQuestions,
  type QuestionDraft,
} from "./stage10_questionGeneration.js";
import { generateFlashcards } from "./stage11_flashcards.js";
import { findUncoveredMustHaveIds, findUncoveredRequirementIds } from "./coverage.js";
import { buildSchedule } from "./schedule.js";
import { IdAllocator } from "./idAllocator.js";
import { deriveCompanyName } from "./companyName.js";
import { validateKit, type Kit, type Question, type Requirement } from "../validation/kitSchema.js";
import { PipelineFatalError, type OnProgress, type PipelineInput, type PipelineWarning } from "./types.js";

function emit(onProgress: OnProgress | undefined, step: Parameters<OnProgress>[0]["step"], status: Parameters<OnProgress>[0]["status"], detail?: string) {
  onProgress?.({ step, status, detail });
}

export interface PipelineOutput {
  kit: Kit;
  warnings: PipelineWarning[];
}

/**
 * Runs the full research + generation + validation pipeline for one
 * (jd, company_url, days) case. This is the single implementation used by
 * both the interactive API (POST /api/kits/:id/generate) and the batch
 * evaluator — the brief is explicit that the batch entry point must not be
 * a parallel implementation.
 */
export async function runPipeline(input: PipelineInput, onProgress?: OnProgress): Promise<PipelineOutput> {
  const warnings: PipelineWarning[] = [];
  const jd = input.jd ?? "";
  const days = Math.max(1, Math.min(365, Math.floor(input.days) || 1));

  emit(onProgress, "validating_jd", "started");
  if (!jd.trim() || jd.trim().length < 2) {
    emit(onProgress, "validating_jd", "failed");
    throw new PipelineFatalError("EMPTY_JD", "Job description is empty or too short to process");
  }
  emit(onProgress, "validating_jd", "done", `${jd.length} characters`);

  // --- Company research: never fatal. A bad or unreachable company URL
  // degrades the kit (honest empty brief, empty pages_used) instead of
  // failing the whole run. ---
  emit(onProgress, "validating_company_url", "started");
  let companyUrlSafe = false;
  try {
    await assertSafeUrl(input.companyUrl);
    companyUrlSafe = true;
    emit(onProgress, "validating_company_url", "done");
  } catch (err) {
    const code = err instanceof UnsafeUrlError ? err.code : "INVALID_URL";
    warnings.push({ code: `COMPANY_URL_${code}`, message: (err as Error).message });
    emit(onProgress, "validating_company_url", "failed", (err as Error).message);
  }

  emit(onProgress, "checking_robots", companyUrlSafe ? "started" : "skipped");
  if (companyUrlSafe) emit(onProgress, "checking_robots", "done");

  let pages: CrawledPage[] = [];
  if (companyUrlSafe) {
    emit(onProgress, "crawling_company_site", "started");
    try {
      const crawl = await crawlSite(input.companyUrl);
      pages = crawl.pages;
      if (!crawl.homepageReachable) {
        warnings.push({ code: "COMPANY_UNREACHABLE", message: `Could not reach ${input.companyUrl}` });
      }
      crawl.skipped.forEach((s) => warnings.push({ code: "PAGE_SKIPPED", message: `${s.url}: ${s.reason}` }));
      emit(onProgress, "crawling_company_site", "done", `${pages.length} pages fetched, ${crawl.skipped.length} skipped`);
    } catch (err) {
      warnings.push({ code: "CRAWL_FAILED", message: (err as Error).message });
      emit(onProgress, "crawling_company_site", "failed", (err as Error).message);
    }
  } else {
    emit(onProgress, "crawling_company_site", "skipped");
  }
  emit(onProgress, "extracting_pages", pages.length > 0 ? "done" : "skipped", `${pages.length} pages`);

  const homepage = pages.find((p) => p.url === input.companyUrl) ?? pages[0];
  const companyName = deriveCompanyName(homepage?.title ?? "", input.companyUrl);

  emit(onProgress, "researching_hiring_process", "started");
  const hiringInsights = await researchHiringProcess(pages).catch((err) => {
    warnings.push({ code: "HIRING_RESEARCH_FAILED", message: (err as Error).message });
    return { found: false, summary: "Hiring-process research failed.", sources: [] };
  });
  emit(onProgress, "researching_hiring_process", hiringInsights.found ? "done" : "skipped", hiringInsights.summary);

  emit(onProgress, "researching_public_discussion", "started");
  const publicDiscussion = await researchPublicDiscussion(companyName).catch((err) => {
    warnings.push({ code: "PUBLIC_DISCUSSION_FAILED", message: (err as Error).message });
    return { found: false, summary: "Public interview discussion not found.", sources: [] };
  });
  emit(
    onProgress,
    "researching_public_discussion",
    publicDiscussion.found ? "done" : "skipped",
    publicDiscussion.summary
  );

  // --- Requirement extraction: essential. Without it there's no kit. ---
  emit(onProgress, "extracting_requirements", "started");
  let extraction;
  try {
    extraction = await extractRequirements(jd);
  } catch (err) {
    emit(onProgress, "extracting_requirements", "failed", (err as Error).message);
    throw new PipelineFatalError("EXTRACTION_FAILED", `Requirement extraction failed: ${(err as Error).message}`);
  }

  const reqIds = new IdAllocator("r");
  const requirements: Requirement[] = extraction.requirements.map((r) => ({ id: reqIds.next(), ...r }));
  emit(onProgress, "extracting_requirements", "done", `${requirements.length} requirements`);

  // --- Company brief, grounded only in retrieved evidence. ---
  const companyBrief = await generateCompanyBrief(pages).catch((err) => {
    warnings.push({ code: "COMPANY_BRIEF_FAILED", message: (err as Error).message });
    return {
      summary: "Company brief generation failed; treat company research as incomplete.",
      what_they_do: "Unknown.",
      sources: pages.map((p) => p.url),
    };
  });

  // --- Question generation: one call per category, sequenced and
  // deliberately instructed differently, per the brief. Run sequentially
  // (not in parallel) to stay gentle on free-tier tokens-per-minute limits. ---
  emit(onProgress, "generating_questions", "started");
  const questionIds = new IdAllocator("q");
  const questions: Question[] = [];

  async function runCategory(label: string, fn: () => Promise<QuestionDraft[]>) {
    try {
      const drafts = await fn();
      for (const d of drafts) {
        questions.push({ ...d, id: questionIds.next(), state: "generated" });
      }
    } catch (err) {
      warnings.push({ code: "QUESTION_GENERATION_FAILED", message: `${label}: ${(err as Error).message}` });
    }
  }

  await runCategory("technical", () => generateTechnicalQuestions(requirements));
  await runCategory("behavioural", () => generateBehaviouralQuestions(requirements));
  await runCategory("system-design", () =>
    generateSystemDesignQuestions(requirements, { title: extraction.title, seniority: extraction.seniority })
  );
  await runCategory("company-fit", () =>
    generateCompanyFitQuestions(requirements, { companyBrief, hiringInsights, publicDiscussion })
  );
  emit(onProgress, "generating_questions", "done", `${questions.length} questions`);

  // --- Deterministic coverage check + second-pass gap filling. Never
  // handed to the model: this is plain application logic. ---
  emit(onProgress, "checking_coverage", "started");
  let uncoveredMust = findUncoveredMustHaveIds(requirements, questions);
  let passes = 1;
  emit(onProgress, "checking_coverage", "done", `${uncoveredMust.length} uncovered must-have requirements`);

  while (uncoveredMust.length > 0 && passes < env.maxCoveragePasses) {
    emit(onProgress, "filling_coverage_gaps", "started", `pass ${passes + 1}`);
    const gapRequirements = requirements.filter((r) => uncoveredMust.includes(r.id));
    const technicalGap = gapRequirements.filter((r) => r.kind === "technical" || r.kind === "domain");
    const behaviouralGap = gapRequirements.filter((r) => r.kind === "behavioural");

    await runCategory("gap-technical", () => generateTechnicalQuestions(technicalGap));
    await runCategory("gap-behavioural", () => generateBehaviouralQuestions(behaviouralGap));

    passes += 1;
    uncoveredMust = findUncoveredMustHaveIds(requirements, questions);
    emit(onProgress, "filling_coverage_gaps", "done", `${uncoveredMust.length} still uncovered`);
  }
  if (uncoveredMust.length > 0) {
    warnings.push({
      code: "UNCOVERED_MUST_REQUIREMENTS",
      message: `${uncoveredMust.length} must-have requirement(s) remain uncovered after ${passes} pass(es): ${uncoveredMust.join(", ")}`,
    });
  }
  const uncoveredAll = findUncoveredRequirementIds(requirements, questions);

  // --- Flashcards. ---
  emit(onProgress, "generating_flashcards", "started");
  const flashcardIds = new IdAllocator("f");
  const flashcards = await generateFlashcards(requirements)
    .then((drafts) => drafts.map((d) => ({ ...d, id: flashcardIds.next(), state: "generated" as const })))
    .catch((err) => {
      warnings.push({ code: "FLASHCARD_GENERATION_FAILED", message: (err as Error).message });
      return [];
    });
  emit(onProgress, "generating_flashcards", "done", `${flashcards.length} flashcards`);

  // --- Schedule: deterministic allocation, never delegated to the model. ---
  emit(onProgress, "building_schedule", "started");
  const schedule = buildSchedule(requirements, questions, days);
  emit(onProgress, "building_schedule", "done", `${schedule.days.length} days`);

  const candidate: Kit = {
    source: {
      company: companyName,
      company_url: input.companyUrl,
      role: extraction.title,
      location: extraction.location,
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: pages.map((p) => p.url),
    },
    company_brief: companyBrief,
    role: {
      title: extraction.title,
      seniority: extraction.seniority,
      responsibilities: extraction.responsibilities,
      requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: uncoveredAll,
      passes,
    },
  };

  emit(onProgress, "validating_kit", "started");
  const validation = validateKit(candidate);
  if (!validation.valid || !validation.kit) {
    emit(onProgress, "validating_kit", "failed", validation.errors.join("; "));
    throw new PipelineFatalError(
      "INVALID_KIT_STRUCTURE",
      `Generated kit failed structure validation: ${validation.errors.join("; ")}`
    );
  }
  emit(onProgress, "validating_kit", "done");

  return { kit: validation.kit, warnings };
}
