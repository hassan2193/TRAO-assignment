/**
 * Small dependency-free concurrency limiter (p-limit style) plus a minimum
 * spacing between task starts, used to keep the crawler polite: bounded
 * parallelism and a floor on request rate against any single origin.
 */
export function createLimiter(concurrency: number, minSpacingMs = 0) {
  let active = 0;
  let lastStart = 0;
  const queue: (() => void)[] = [];

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    const run = queue.shift();
    if (run) run();
  }

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const attempt = async () => {
        active++;
        const wait = Math.max(0, minSpacingMs - (Date.now() - lastStart));
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastStart = Date.now();
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          active--;
          next();
        }
      };
      queue.push(attempt);
      next();
    });
  };
}
