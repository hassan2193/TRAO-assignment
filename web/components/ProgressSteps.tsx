const STEP_LABELS: Record<string, string> = {
  validating_jd: "Validating job description",
  validating_company_url: "Validating company URL",
  checking_robots: "Checking robots.txt",
  crawling_company_site: "Crawling company site",
  extracting_pages: "Extracting page content",
  researching_hiring_process: "Researching hiring process",
  researching_public_discussion: "Researching public interview discussion",
  extracting_requirements: "Extracting role requirements",
  generating_questions: "Generating questions",
  checking_coverage: "Checking requirement coverage",
  filling_coverage_gaps: "Filling coverage gaps",
  generating_flashcards: "Generating flashcards",
  building_schedule: "Building study schedule",
  validating_kit: "Validating kit structure",
};

interface ProgressEvent {
  step: string;
  status: string;
  detail?: string;
  at: string;
}

function icon(status: string) {
  if (status === "done") return <span className="text-emerald-600">✓</span>;
  if (status === "failed") return <span className="text-red-600">✕</span>;
  if (status === "skipped") return <span className="text-slate-400">–</span>;
  return <span className="animate-pulse text-amber-500">●</span>;
}

export function ProgressSteps({ events }: { events: ProgressEvent[] }) {
  const latestByStep = new Map<string, ProgressEvent>();
  for (const e of events) latestByStep.set(e.step, e);

  const orderedSteps = Object.keys(STEP_LABELS).filter((s) => latestByStep.has(s));

  if (orderedSteps.length === 0) {
    return <p className="text-sm text-slate-500">Starting generation…</p>;
  }

  return (
    <ol className="space-y-1.5 text-sm">
      {orderedSteps.map((step) => {
        const event = latestByStep.get(step)!;
        return (
          <li key={step} className="flex items-start gap-2">
            <span className="w-4 shrink-0 text-center" aria-hidden>
              {icon(event.status)}
            </span>
            <span className={event.status === "failed" ? "text-red-700" : "text-slate-700"}>
              {STEP_LABELS[step] ?? step}
              {event.detail && <span className="text-slate-400"> — {event.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
