export type ProgressStep =
  | "validating_jd"
  | "validating_company_url"
  | "checking_robots"
  | "crawling_company_site"
  | "extracting_pages"
  | "researching_hiring_process"
  | "researching_public_discussion"
  | "extracting_requirements"
  | "generating_questions"
  | "checking_coverage"
  | "filling_coverage_gaps"
  | "generating_flashcards"
  | "building_schedule"
  | "validating_kit";

export type ProgressStatus = "started" | "done" | "skipped" | "failed";

export interface ProgressEvent {
  step: ProgressStep;
  status: ProgressStatus;
  detail?: string;
}

export type OnProgress = (event: ProgressEvent) => void;

export interface PipelineInput {
  jd: string;
  companyUrl: string;
  days: number;
}

export interface PipelineWarning {
  code: string;
  message: string;
}

export class PipelineFatalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PipelineFatalError";
  }
}
