import { generateStructured, wrapUntrusted } from "../llm/gemini.js";
import { HiringInsightResponseSchema } from "../llm/schemas.js";
import { SECURITY_PREAMBLE } from "../llm/prompts/shared.js";
import { searchPublicDiscussion } from "./publicDiscussionSearch.js";
import type { HiringInsights } from "./stage6_hiringResearch.js";

const NOT_FOUND: HiringInsights = {
  found: false,
  summary: "Public interview discussion not found.",
  sources: [],
};

/**
 * Stage 7: separate from the company-site crawl, this looks for public
 * discussion of the company's interview process (Glassdoor/Reddit/Blind/
 * levels.fyi via a keyless web search). Search failures or empty results are
 * an honest, expected outcome, not a pipeline failure.
 */
export async function researchPublicDiscussion(companyName: string): Promise<HiringInsights> {
  if (!companyName.trim()) return NOT_FOUND;

  const results = await searchPublicDiscussion(companyName);
  if (results.length === 0) return NOT_FOUND;

  const evidence = results
    .map((r) => `TITLE: ${r.title}\nURL: ${r.url}\n${wrapUntrusted(r.url, r.snippet || "(no snippet)")}`)
    .join("\n\n---\n\n");

  const system = `${SECURITY_PREAMBLE}

Summarize what these search-result snippets reveal about public discussion of this company's interview process. The snippets are short and may not actually be about interviewing — if they don't genuinely describe the interview process, set found to false rather than guessing or padding out a summary.`;

  const prompt = `Company: ${companyName}

Search snippets:

${evidence}

Return JSON: { "found": boolean, "summary": string (2-4 sentences if found, otherwise a one-sentence honest note) }`;

  const result = await generateStructured(system, prompt, HiringInsightResponseSchema);
  if (!result.found) return { found: false, summary: result.summary, sources: [] };
  return { found: true, summary: result.summary, sources: results.map((r) => r.url) };
}
