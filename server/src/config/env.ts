import "dotenv/config";

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Origins the API accepts credentialed (cookie-based) requests from. Always
// includes local dev and the deployed frontend, so production works out of
// the box even if CORS_ORIGIN isn't set on the host; CORS_ORIGIN (comma-
// separated) adds further origins on top rather than replacing these.
const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "https://trao-assignment-1.onrender.com"];

function resolveCorsOrigins(): string[] {
  const extra = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...extra]));
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  // Render (and most PaaS hosts) inject PORT and require the app to bind to
  // it; 4000 is only the local-dev fallback. `||` (not `??`) so an empty
  // string is also treated as "not set" rather than becoming port 0.
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/interview_prep_kit",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigins: resolveCorsOrigins(),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest",
  // Allows the batch evaluator / dev environment to target localhost /
  // private-network fixture servers (e.g. http://localhost:8099/acme/) used
  // for grading, while production deployments still reject SSRF targets.
  allowPrivateNetworkTargets:
    process.env.ALLOW_PRIVATE_NETWORK_TARGETS === "true" ||
    (process.env.NODE_ENV ?? "development") !== "production",
  maxCoveragePasses: Number(process.env.MAX_COVERAGE_PASSES ?? 3),
  crawlMaxPages: Number(process.env.CRAWL_MAX_PAGES ?? 12),
  crawlConcurrency: Number(process.env.CRAWL_CONCURRENCY ?? 3),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 10000),
  maxResponseBytes: Number(process.env.MAX_RESPONSE_BYTES ?? 3_000_000),
};

export function requireGeminiKey(): string {
  return readEnv("GEMINI_API_KEY", env.geminiApiKey || undefined);
}
