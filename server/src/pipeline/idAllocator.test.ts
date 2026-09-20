import { describe, expect, it } from "vitest";
import { IdAllocator } from "./idAllocator.js";

describe("IdAllocator", () => {
  it("allocates sequential ids from scratch", () => {
    const ids = new IdAllocator("r");
    expect(ids.next()).toBe("r1");
    expect(ids.next()).toBe("r2");
    expect(ids.next()).toBe("r3");
  });

  it("continues after the highest existing id", () => {
    const ids = new IdAllocator("q", ["q1", "q2", "q5"]);
    expect(ids.next()).toBe("q6");
  });

  it("ignores ids from a different prefix", () => {
    const ids = new IdAllocator("f", ["r1", "r2"]);
    expect(ids.next()).toBe("f1");
  });
});
