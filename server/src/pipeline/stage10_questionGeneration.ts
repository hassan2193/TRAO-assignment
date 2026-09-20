import { generateStructured } from "../llm/gemini.js";
import { QuestionsResponseSchema } from "../llm/schemas.js";
import { SECURITY_PREAMBLE } from "../llm/prompts/shared.js";
import type { Requirement } from "../validation/kitSchema.js";
import type { HiringInsights } from "./stage6_hiringResearch.js";
import type { CompanyBrief } from "../validation/kitSchema.js";

export interface QuestionDraft {
  requirement_ids: string[];
  category: "technical" | "behavioural" | "system-design" | "company-fit";
  prompt: string;
  answer_outline: string;
  difficulty: number;
}

interface GenerateOptions {
  extraContext?: string;
  requireRequirementTie?: boolean;
}

/**
 * Shared plumbing for a single category's question call. Each of the
 * category-specific functions below supplies its own instruction focus and
 * its own slice of requirements, so technical and behavioural questions —
 * for example — never come from the same call with the same instructions.
 */
async function generateForRequirements(
  requirements: Requirement[],
  category: QuestionDraft["category"],
  instructionFocus: string,
  options: GenerateOptions = {}
): Promise<QuestionDraft[]> {
  if (requirements.length === 0) return [];
  const { extraContext, requireRequirementTie = true } = options;

  const reqList = requirements.map((r) => `- id="${r.id}" [${r.priority}] ${r.text}`).join("\n");

  const system = `${SECURITY_PREAMBLE}

${instructionFocus}

Every question's requirement_ids array must only contain ids from the list given below — never invent new ids. Generate one to two questions per requirement, weighted toward "must" priority requirements. difficulty is an integer: 1 = warm-up/basic, 2 = solid working knowledge, 3 = deep or edge-case.`;

  const prompt = `Requirements to cover (id, priority, text):
${reqList}
${extraContext ? `\nAdditional context:\n${extraContext}\n` : ""}
Return JSON: {"questions":[{"requirement_ids":string[],"prompt":string,"answer_outline":string,"difficulty":number}]}`;

  const result = await generateStructured(system, prompt, QuestionsResponseSchema);
  const validIds = new Set(requirements.map((r) => r.id));

  return result.questions
    .map((q) => ({ ...q, requirement_ids: q.requirement_ids.filter((id) => validIds.has(id)), category }))
    .filter((q) => !requireRequirementTie || q.requirement_ids.length > 0);
}

export async function generateTechnicalQuestions(requirements: Requirement[]): Promise<QuestionDraft[]> {
  const targets = requirements.filter((r) => r.kind === "technical" || r.kind === "domain");
  return generateForRequirements(
    targets,
    "technical",
    `Write technical interview questions that test hands-on knowledge and problem-solving ability for the specific tools, languages, systems or domain knowledge named in each requirement. Prefer concrete, specific questions over generic ones — "describe a time you..." belongs to a behavioural interview, not this one.`
  );
}

export async function generateBehaviouralQuestions(requirements: Requirement[]): Promise<QuestionDraft[]> {
  const targets = requirements.filter((r) => r.kind === "behavioural");
  return generateForRequirements(
    targets,
    "behavioural",
    `Write behavioural interview questions, STAR-format ("tell me about a time you..."), that probe the soft skills, leadership, mentoring or collaboration ability named in each requirement.`
  );
}

export async function generateSystemDesignQuestions(
  requirements: Requirement[],
  roleContext: { title: string; seniority: string }
): Promise<QuestionDraft[]> {
  const seniorityIndicatesDesign = /senior|staff|lead|principal|architect/i.test(roleContext.seniority);
  const targets = requirements.filter(
    (r) => r.kind === "technical" && r.priority === "must" && (seniorityIndicatesDesign || requirements.length <= 4)
  );
  if (targets.length === 0) return [];
  return generateForRequirements(
    targets,
    "system-design",
    `Write system-design interview questions appropriate for a ${roleContext.seniority || "mid-level"} ${
      roleContext.title || "engineering"
    } role. Build on the named technical requirements at an architecture/scale level (data flow, reliability, scaling trade-offs) — not syntax-level questions. If a requirement is too narrow for a meaningful design question (e.g. a single library detail), it's fine to skip it rather than force one.`
  );
}

export async function generateCompanyFitQuestions(
  requirements: Requirement[],
  context: { companyBrief: CompanyBrief; hiringInsights: HiringInsights; publicDiscussion: HiringInsights }
): Promise<QuestionDraft[]> {
  const hasGrounding =
    context.companyBrief.sources.length > 0 || context.hiringInsights.found || context.publicDiscussion.found;
  if (!hasGrounding) return [];

  const groundingParts = [
    context.companyBrief.summary ? `Company brief: ${context.companyBrief.summary}` : "",
    context.hiringInsights.found ? `Hiring process (from company site): ${context.hiringInsights.summary}` : "",
    context.publicDiscussion.found
      ? `Public discussion of interview process: ${context.publicDiscussion.summary}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const behaviouralOrDomain = requirements.filter((r) => r.kind === "behavioural" || r.kind === "domain");
  const targets = behaviouralOrDomain.length > 0 ? behaviouralOrDomain : requirements.slice(0, 3);

  return generateForRequirements(
    targets,
    "company-fit",
    `Write company-fit interview questions — why this company, culture alignment, how the candidate's background connects to what the company actually does or how they actually run their interview process. Ground every question strictly in the context given below; do not invent company facts beyond it.`,
    { extraContext: groundingParts, requireRequirementTie: false }
  );
}
