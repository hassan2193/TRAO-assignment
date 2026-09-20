export type RequirementKind = "technical" | "behavioural" | "domain";
export type RequirementPriority = "must" | "nice";
export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type EntryState = "generated" | "edited" | "pinned";

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface Question {
  id: string;
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: number;
  state: EntryState;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  state: EntryState;
}

export interface ScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

export interface Schedule {
  days_available: number;
  days: ScheduleDay[];
}

export interface Coverage {
  uncovered_requirement_ids: string[];
  passes: number;
}

export interface Source {
  company: string;
  company_url: string;
  role: string;
  location: string;
  jd_chars: number;
  researched_at: string;
  pages_used: string[];
}

export interface CompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
}

export interface Role {
  title: string;
  seniority: string;
  responsibilities: string[];
  requirements: Requirement[];
}

export interface Kit {
  source: Source;
  company_brief: CompanyBrief;
  role: Role;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;
}

export type KitStatus = "pending" | "generating" | "ready" | "failed";

export interface KitSummary {
  id: string;
  status: KitStatus;
  company: string | null;
  role: string;
  days: number;
  createdAt: string;
  updatedAt: string;
  error: { code: string; message: string } | null;
}

export interface KitRecord {
  id: string;
  userId: string;
  status: KitStatus;
  input: { jd: string; companyUrl: string; days: number };
  kit: Kit | null;
  warnings: { code: string; message: string }[];
  error: { code: string; message: string } | null;
  progressEvents: { step: string; status: string; detail?: string; at: string }[];
  practiceLog: { flashcardId: string; confidence: number; reviewedAt: string }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Runtime shape guard for a `Kit`, used at the one place a generated kit
 * crosses from "network response" to "rendered UI" (kits/[id]/page.tsx).
 *
 * The backend's Zod schema (server/src/validation/kitSchema.ts) is the
 * real source of truth and guarantees a *saved* kit is always complete —
 * this guard is not a substitute for that. It exists because a kit can
 * reach the frontend as a truthy-but-malformed object without the backend
 * schema ever being violated: a response-shape mismatch (returning the
 * wrong nesting level), a stale cached response, or any other transport
 * bug. `kit` being non-null does not by itself mean its shape is right, so
 * every field this checks is exactly the set of top-level sections the Kit
 * Detail page and its panels read without further guards: role, source,
 * company_brief, questions, flashcards, schedule, coverage.
 */
export function isCompleteKit(kit: Kit | null | undefined): kit is Kit {
  if (!kit || typeof kit !== "object") return false;
  return (
    !!kit.role &&
    Array.isArray(kit.role.requirements) &&
    !!kit.source &&
    !!kit.company_brief &&
    Array.isArray(kit.questions) &&
    Array.isArray(kit.flashcards) &&
    !!kit.schedule &&
    Array.isArray(kit.schedule.days) &&
    !!kit.coverage &&
    Array.isArray(kit.coverage.uncovered_requirement_ids)
  );
}

export interface WeakSpotsReport {
  weakRequirements: { id: string; text: string; priority: string; reason: string; averageConfidence: number | null }[];
  weakFlashcards: { id: string; front: string; lastConfidence: number | null; covered: boolean }[];
  uncoveredMustHaves: { id: string; text: string }[];
  recommendation: string;
}
