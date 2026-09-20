import { describe, expect, it } from "vitest";
import { buildSchedule } from "./schedule.js";
import type { Question, Requirement } from "../validation/kitSchema.js";

function req(id: string, priority: "must" | "nice" = "must"): Requirement {
  return { id, text: `requirement ${id}`, kind: "technical", priority };
}

function question(id: string, requirementIds: string[], difficulty = 2): Question {
  return {
    id,
    requirement_ids: requirementIds,
    category: "technical",
    prompt: `question ${id}`,
    answer_outline: "",
    difficulty,
    state: "generated",
  };
}

describe("buildSchedule", () => {
  const requirements = [req("r1"), req("r2"), req("r3", "nice")];
  const questions = [
    question("q1", ["r1"], 3),
    question("q2", ["r2"], 1),
    question("q3", ["r3"], 2),
    question("q4", ["r1", "r2"], 2),
  ];

  it("produces exactly the number of days requested", () => {
    expect(buildSchedule(requirements, questions, 5).days).toHaveLength(5);
    expect(buildSchedule(requirements, questions, 1).days).toHaveLength(1);
    expect(buildSchedule(requirements, questions, 60).days).toHaveLength(60);
  });

  it("gives every day an integer minutes value", () => {
    for (const days of [1, 5, 60]) {
      const schedule = buildSchedule(requirements, questions, days);
      for (const day of schedule.days) {
        expect(Number.isInteger(day.minutes)).toBe(true);
        expect(day.minutes).toBeGreaterThan(0);
      }
    }
  });

  it("places every question exactly once across the schedule", () => {
    const schedule = buildSchedule(requirements, questions, 3);
    const allIds = schedule.days.flatMap((d) => d.question_ids);
    expect(allIds.sort()).toEqual(["q1", "q2", "q3", "q4"]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("ensures every must-have requirement is covered by a scheduled question", () => {
    const schedule = buildSchedule(requirements, questions, 5);
    const scheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
    const scheduledQuestions = questions.filter((q) => scheduledIds.has(q.id));
    const mustHaveIds = requirements.filter((r) => r.priority === "must").map((r) => r.id);
    for (const rid of mustHaveIds) {
      const covered = scheduledQuestions.some((q) => q.requirement_ids.includes(rid));
      expect(covered).toBe(true);
    }
  });

  it("front-loads the hardest / must-priority question onto day 1", () => {
    const schedule = buildSchedule(requirements, questions, 4);
    expect(schedule.days[0].question_ids).toContain("q1");
  });

  it("gives a 1-day schedule a single day holding all the material", () => {
    const schedule = buildSchedule(requirements, questions, 1);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].question_ids.sort()).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("gives a 60-day schedule spare review days when there isn't enough material", () => {
    const schedule = buildSchedule(requirements, questions, 60);
    const contentDays = schedule.days.filter((d) => d.question_ids.length > 0);
    const reviewDays = schedule.days.filter((d) => d.question_ids.length === 0);
    expect(contentDays.length).toBeGreaterThan(0);
    expect(reviewDays.length).toBeGreaterThan(0);
    for (const day of reviewDays) {
      expect(day.focus.length).toBeGreaterThan(0);
    }
  });

  it("never references a question id that doesn't exist", () => {
    const schedule = buildSchedule(requirements, questions, 7);
    const validIds = new Set(questions.map((q) => q.id));
    for (const day of schedule.days) {
      for (const qid of day.question_ids) {
        expect(validIds.has(qid)).toBe(true);
      }
    }
  });
});
