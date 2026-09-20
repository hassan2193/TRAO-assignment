import { readFile, writeFile } from "node:fs/promises";
import { runPipeline } from "../pipeline/orchestrator.js";
import { PipelineFatalError } from "../pipeline/types.js";
import { createLimiter } from "../services/concurrencyLimiter.js";
import type { Kit } from "../validation/kitSchema.js";

interface BatchCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

interface BatchKitResult {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

function parseArgs(argv: string[]): { input: string; output: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
  }
  if (!args.input || !args.output) {
    throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  }
  return { input: args.input, output: args.output };
}

async function runCase(c: BatchCase): Promise<BatchKitResult> {
  try {
    if (!c.jd || !c.company_url || typeof c.days !== "number") {
      return {
        id: c.id,
        status: "failed",
        kit: null,
        error: { code: "INVALID_CASE", message: "Case is missing jd, company_url, or days" },
      };
    }
    const { kit } = await runPipeline({ jd: c.jd, companyUrl: c.company_url, days: c.days });
    return { id: c.id, status: "ok", kit, error: null };
  } catch (err) {
    const code = err instanceof PipelineFatalError ? err.code : "UNKNOWN_ERROR";
    return { id: c.id, status: "failed", kit: null, error: { code, message: (err as Error).message } };
  }
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));

  const raw = await readFile(input, "utf-8");
  const cases: BatchCase[] = JSON.parse(raw);
  if (!Array.isArray(cases)) throw new Error("Input file must contain a JSON array of cases");

  // Bounded concurrency: fast enough to finish within the time budget, low
  // enough to stay polite to both the target sites and the Gemini free
  // tier (whose own retry/backoff in llm/gemini.ts absorbs the rest).
  const concurrency = Number(process.env.EVALUATE_CONCURRENCY ?? 2);
  const limit = createLimiter(concurrency);

  const results = await Promise.all(
    cases.map((c) =>
      limit(async () => {
        // eslint-disable-next-line no-console
        console.log(`[evaluate] running case ${c.id}...`);
        const result = await runCase(c);
        // eslint-disable-next-line no-console
        console.log(`[evaluate] case ${c.id} -> ${result.status}`);
        return result;
      })
    )
  );

  const outputPayload = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await writeFile(output, JSON.stringify(outputPayload, null, 2), "utf-8");
  // eslint-disable-next-line no-console
  console.log(`[evaluate] wrote ${results.length} result(s) to ${output}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[evaluate] fatal error", err);
  process.exit(1);
});
