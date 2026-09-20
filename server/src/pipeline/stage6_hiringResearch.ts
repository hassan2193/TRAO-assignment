import { generateStructured, wrapUntrusted } from "../llm/gemini.js";
import { HiringInsightResponseSchema } from "../llm/schemas.js";
import { SECURITY_PREAMBLE } from "../llm/prompts/shared.js";
import type { CrawledPage } from "./crawler.js";

export interface HiringInsights {
  found: boolean;
  summary: string;
  sources: string[];
}

const NOT_FOUND: HiringInsights = {
  found: false,
  summary: "No hiring-process information was found on the company site.",
  sources: [],
};

/**
 * Stage 6: look at whichever crawled pages were categorized as hiring-signal
 * pages and ask what they reveal about how the company interviews. If the
 * crawl found no such pages, this is a deterministic short-circuit — no LLM
 * call, no risk of the model inventing a process that was never published.
 */
export async function researchHiringProcess(pages: CrawledPage[]): Promise<HiringInsights> {
  const hiringPages = pages.filter((p) => p.category === "hiring");
  if (hiringPages.length === 0) return NOT_FOUND;

  const evidence = hiringPages
    .slice(0, 4)
    .map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${wrapUntrusted(p.url, p.text.slice(0, 3000))}`)
    .join("\n\n---\n\n");

  const system = `${SECURITY_PREAMBLE}

Summarize what the evidence reveals about how this company hires and interviews engineers — stages, take-home assignments, system design rounds, behavioural rounds, timelines. Use ONLY the evidence given; do not add generic assumptions about how tech companies typically interview. If the evidence doesn't actually describe a hiring or interview process (e.g. it's just a generic "we're hiring!" page with no process detail), set found to false and say so plainly.`;

  const prompt = `Evidence from pages found on the company's own site that looked hiring-related:

${evidence}

Return JSON: { "found": boolean, "summary": string (2-5 sentences if found, otherwise a one-sentence honest note) }`;

  const result = await generateStructured(system, prompt, HiringInsightResponseSchema);
  if (!result.found) return { found: false, summary: result.summary, sources: [] };
  return { found: true, summary: result.summary, sources: hiringPages.map((p) => p.url) };
}
