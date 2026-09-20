import { describe, expect, it } from "vitest";
import { validateKit, type Kit } from "./kitSchema.js";

function baseKit(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.example",
      role: "Backend Engineer",
      location: "Remote",
      jd_chars: 500,
      researched_at: new Date().toISOString(),
      pages_used: ["https://acme.example/careers"],
    },
    company_brief: { summary: "Acme builds widgets.", what_they_do: "Widgets.", sources: ["https://acme.example"] },
    role: {
      title: "Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Build APIs"],
      requirements: [{ id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" }],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Explain Node.js event loop",
        answer_outline: "Mention libuv, phases",
        difficulty: 2,
        state: "generated",
      },
    ],
    flashcards: [{ id: "f1", front: "What is the event loop?", back: "...", requirement_ids: ["r1"] }],
    schedule: { days_available: 1, days: [{ day: 1, focus: "Technical", question_ids: ["q1"], minutes: 30 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("validateKit", () => {
  it("accepts a well-formed kit", () => {
    const result = validateKit(baseKit());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a kit missing a required field", () => {
    const kit = baseKit() as unknown as Record<string, unknown>;
    delete kit.company_brief;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("company_brief"))).toBe(true);
  });

  it("rejects difficulty outside 1-3", () => {
    const kit = baseKit();
    kit.questions[0].difficulty = 5;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid question category", () => {
    const kit = baseKit() as unknown as { questions: { category: string }[] };
    kit.questions[0].category = "trivia";
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });

  it("rejects a question that references a requirement id that doesn't exist", () => {
    const kit = baseKit();
    kit.questions[0].requirement_ids = ["r-does-not-exist"];
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown requirement id"))).toBe(true);
  });

  it("rejects a schedule day that references a question id that doesn't exist", () => {
    const kit = baseKit();
    kit.schedule.days[0].question_ids = ["q-does-not-exist"];
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown question id"))).toBe(true);
  });

  it("rejects a non-integer minutes value", () => {
    const kit = baseKit() as unknown as { schedule: { days: { minutes: number }[] } };
    kit.schedule.days[0].minutes = 30.5;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate requirement ids", () => {
    const kit = baseKit();
    kit.role.requirements.push({ id: "r1", text: "duplicate", kind: "technical", priority: "nice" });
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });
});
