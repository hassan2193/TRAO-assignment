/**
 * Allocates stable, monotonically-increasing ids (r1, r2, ... / q1, q2, ... /
 * f1, f2, ...) scoped to a single kit. Seeding a counter from existing ids
 * lets us keep allocating fresh ids after a kit has already been generated
 * once (e.g. adding a question by hand, or filling a coverage gap).
 */
export class IdAllocator {
  private counter: number;

  constructor(private readonly prefix: string, existingIds: string[] = []) {
    const max = existingIds.reduce((acc, id) => {
      const match = id.match(new RegExp(`^${prefix}(\\d+)$`));
      if (!match) return acc;
      return Math.max(acc, Number(match[1]));
    }, 0);
    this.counter = max;
  }

  next(): string {
    this.counter += 1;
    return `${this.prefix}${this.counter}`;
  }
}
