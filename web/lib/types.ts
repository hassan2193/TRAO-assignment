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

export interface WeakSpotsReport {
  weakRequirements: { id: string; text: string; priority: string; reason: string; averageConfidence: number | null }[];
  weakFlashcards: { id: string; front: string; lastConfidence: number | null; covered: boolean }[];
  uncoveredMustHaves: { id: string; text: string }[];
  recommendation: string;
}
