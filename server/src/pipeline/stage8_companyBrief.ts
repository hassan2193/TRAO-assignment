import { generateStructured, wrapUntrusted } from "../llm/gemini.js";
import { CompanyBriefResponseSchema } from "../llm/schemas.js";
import { SECURITY_PREAMBLE } from "../llm/prompts/shared.js";
import type { CrawledPage } from "./crawler.js";
import type { CompanyBrief } from "../validation/kitSchema.js";

const NO_EVIDENCE: CompanyBrief = {
  summary: "We could not retrieve any pages from the company website, so no company brief could be generated from verified sources. Treat company research as incomplete.",
  what_they_do: "Unknown — the company site was unreachable or returned no usable content.",
  sources: [],
};

/**
 * Stage 8: writes the company brief strictly from retrieved page text.
 * With zero crawled pages this is a deterministic honest fallback — no LLM
 * call, no fabricated company facts.
 */
export async function generateCompanyBrief(pages: CrawledPage[]): Promise<CompanyBrief> {
  if (pages.length === 0) return NO_EVIDENCE;

  const evidencePages = pages.slice(0, 6);
  const evidence = evidencePages
    .map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${wrapUntrusted(p.url, p.text.slice(0, 2500))}`)
    .join("\n\n---\n\n");

  const system = `${SECURITY_PREAMBLE}

You write a short, factual company brief for a job candidate, using ONLY the evidence provided below. Do not invent funding figures, headcount, founding dates, or any claim not present in the evidence. If the evidence is thin or mostly navigation/marketing boilerplate with little substance, say so honestly rather than padding the brief with generic claims.`;

  const prompt = `Evidence gathered from the company's own website:

${evidence}

Return JSON:
{
  "summary": string (2-4 sentences a candidate should know before interviewing),
  "what_they_do": string (1-3 sentences on their product/business, grounded in the evidence)
}`;

  const result = await generateStructured(system, prompt, CompanyBriefResponseSchema);
  return { ...result, sources: evidencePages.map((p) => p.url) };
}
