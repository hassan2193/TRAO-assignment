import { describe, expect, it } from "vitest";
import { findUncoveredMustHaveIds, findUncoveredRequirementIds } from "./coverage.js";
import type { Question, Requirement } from "../validation/kitSchema.js";

function req(id: string, priority: "must" | "nice" = "must"): Requirement {
  return { id, text: `requirement ${id}`, kind: "technical", priority };
}

function question(id: string, requirementIds: string[]): Question {
  return {
    id,
    requirement_ids: requirementIds,
    category: "technical",
    prompt: `question ${id}`,
    answer_outline: "",
    difficulty: 2,
    state: "generated",
  };
}

describe("findUncoveredRequirementIds", () => {
  it("returns empty when every requirement is covered", () => {
    const requirements = [req("r1"), req("r2")];
    const questions = [question("q1", ["r1"]), question("q2", ["r2"])];
    expect(findUncoveredRequirementIds(requirements, questions)).toEqual([]);
  });

  it("flags a single uncovered requirement", () => {
    const requirements = [req("r1"), req("r2")];
    const questions = [question("q1", ["r1"])];
    expect(findUncoveredRequirementIds(requirements, questions)).toEqual(["r2"]);
  });

  it("flags multiple uncovered requirements", () => {
    const requirements = [req("r1"), req("r2"), req("r3")];
    const questions: Question[] = [];
    expect(findUncoveredRequirementIds(requirements, questions)).toEqual(["r1", "r2", "r3"]);
  });

  it("treats a question that references multiple requirements as covering all of them", () => {
    const requirements = [req("r1"), req("r2")];
    const questions = [question("q1", ["r1", "r2"])];
    expect(findUncoveredRequirementIds(requirements, questions)).toEqual([]);
  });
});

describe("findUncoveredMustHaveIds", () => {
  it("ignores uncovered nice-to-have requirements", () => {
    const requirements = [req("r1", "must"), req("r2", "nice")];
    const questions = [question("q1", ["r1"])];
    expect(findUncoveredMustHaveIds(requirements, questions)).toEqual([]);
  });

  it("reports uncovered must-have requirements", () => {
    const requirements = [req("r1", "must"), req("r2", "must")];
    const questions = [question("q1", ["r1"])];
    expect(findUncoveredMustHaveIds(requirements, questions)).toEqual(["r2"]);
  });
});
