import { generateStructured, wrapUntrusted } from "../llm/gemini.js";
import { ExtractRequirementsResponseSchema, type ExtractRequirementsResponse } from "../llm/schemas.js";
import { SECURITY_PREAMBLE } from "../llm/prompts/shared.js";

/**
 * Stage 1: extract role title, seniority, responsibilities and requirements
 * from the pasted job description. This is the one call that also produces
 * the "role breakdown" — there is no separate call for it, since the
 * breakdown *is* this structured extraction; a second call over the same
 * text would just be the same work with extra latency and rate-limit risk.
 */
export async function extractRequirements(jdText: string): Promise<ExtractRequirementsResponse> {
  const system = `${SECURITY_PREAMBLE}

You extract structured role information from a pasted job description for an interview-prep tool. Be conservative and literal.

Rules:
- Only extract requirements that are actually stated or clearly implied by the text. Never invent requirements, skills, or years of experience the posting does not mention. A thin posting should produce a short requirements list, not a padded one.
- priority is "must" when the text uses language like "required", "must have", "X+ years", "you have", stated as a baseline expectation. priority is "nice" when the text uses language like "nice to have", "bonus", "preferred", "a plus", "ideally".
- kind is "technical" for specific tools/languages/frameworks/systems, "behavioural" for soft skills / collaboration / leadership / mentoring / communication, and "domain" for industry or business-domain knowledge (e.g. "experience in fintech", "healthcare compliance knowledge").
- responsibilities are short bullet-style strings paraphrased from the text, not invented duties.
- seniority: infer a short label (e.g. "Junior", "Mid-level", "Senior", "Staff") only if the text gives a real signal (years of experience, title, explicit seniority word); otherwise return an empty string.
- location: the role's stated location (e.g. "Remote", "San Francisco, CA", "Remote (US)") if the text says so; otherwise an empty string. Do not guess.
- If the description is extremely short or vague, it is correct and expected to return very few requirements and a brief/empty responsibilities list. Do not compensate by inventing generic requirements.`;

  const prompt = `Job description to analyze:
${wrapUntrusted("pasted_job_description", jdText)}

Return JSON exactly in this shape:
{
  "title": string,
  "seniority": string,
  "location": string,
  "responsibilities": string[],
  "requirements": [
    { "text": string, "kind": "technical" | "behavioural" | "domain", "priority": "must" | "nice" }
  ]
}`;

  return generateStructured(system, prompt, ExtractRequirementsResponseSchema);
}
