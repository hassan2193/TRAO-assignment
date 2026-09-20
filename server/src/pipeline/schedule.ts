import type { Question, Requirement, Schedule, ScheduleDay } from "../validation/kitSchema.js";

/**
 * Deterministic schedule allocation. The LLM never sees this: day count,
 * ordering and durations are arithmetic over the already-generated question
 * bank, driven by requirement priority and question difficulty.
 */

const DIFFICULTY_MINUTES: Record<number, number> = { 1: 20, 2: 30, 3: 45 };
const MIN_DAILY_BUDGET_MINUTES = 30;
const REVIEW_DAY_MINUTES = 30;
const MAX_DAILY_BUDGET_MINUTES = 240;

function estimateMinutes(question: Question): number {
  return DIFFICULTY_MINUTES[question.difficulty] ?? 25;
}

function priorityWeight(question: Question, requirementsById: Map<string, Requirement>): number {
  let weight = 0;
  for (const rid of question.requirement_ids) {
    const req = requirementsById.get(rid);
    if (req?.priority === "must") weight = Math.max(weight, 2);
    else if (req && weight < 1) weight = 1;
  }
  return weight;
}

function categoryLabel(category: string): string {
  switch (category) {
    case "technical":
      return "Technical fundamentals";
    case "behavioural":
      return "Behavioural stories";
    case "system-design":
      return "System design";
    case "company-fit":
      return "Company & culture fit";
    default:
      return category;
  }
}

function focusForDay(dayQuestions: Question[]): string {
  if (dayQuestions.length === 0) {
    return "Review and light practice";
  }
  const counts = new Map<string, number>();
  for (const q of dayQuestions) {
    counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 2).map(([category]) => categoryLabel(category));
  return top.join(" + ");
}

/**
 * Builds a schedule that spans exactly `daysAvailable` days, places every
 * generated question exactly once, orders harder / higher-priority material
 * into earlier days, and never references a question id that doesn't exist
 * (every question gets scheduled, so every must-have requirement — which is
 * guaranteed at least one covering question by the coverage loop — is
 * guaranteed to appear somewhere in the schedule too).
 */
export function buildSchedule(
  requirements: Requirement[],
  questions: Question[],
  daysAvailable: number
): Schedule {
  const N = Math.max(1, Math.floor(daysAvailable));
  const requirementsById = new Map(requirements.map((r) => [r.id, r]));

  const scored = questions
    .map((q, index) => ({
      question: q,
      index,
      weight: priorityWeight(q, requirementsById),
      minutes: estimateMinutes(q),
    }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (b.question.difficulty !== a.question.difficulty) {
        return b.question.difficulty - a.question.difficulty;
      }
      return a.index - b.index;
    });

  const totalMinutes = scored.reduce((sum, s) => sum + s.minutes, 0);
  const perDayBudget = Math.min(
    MAX_DAILY_BUDGET_MINUTES,
    Math.max(MIN_DAILY_BUDGET_MINUTES, Math.ceil(totalMinutes / N))
  );

  const days: { day: number; questions: Question[]; minutes: number }[] = Array.from(
    { length: N },
    (_, i) => ({ day: i + 1, questions: [], minutes: 0 })
  );

  let dayIdx = 0;
  for (const item of scored) {
    while (
      dayIdx < N - 1 &&
      days[dayIdx].minutes > 0 &&
      days[dayIdx].minutes + item.minutes > perDayBudget
    ) {
      dayIdx++;
    }
    days[dayIdx].questions.push(item.question);
    days[dayIdx].minutes += item.minutes;
  }

  const scheduleDays: ScheduleDay[] = days.map((d) => ({
    day: d.day,
    focus: focusForDay(d.questions),
    question_ids: d.questions.map((q) => q.id),
    minutes: d.questions.length === 0 ? REVIEW_DAY_MINUTES : d.minutes,
  }));

  return { days_available: N, days: scheduleDays };
}
