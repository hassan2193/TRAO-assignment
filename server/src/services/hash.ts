import { createHash } from "node:crypto";

/**
 * Deterministic fingerprint for a (jd, companyUrl, days) case, used to
 * detect the same description + company being submitted twice so we can
 * return the existing kit instead of re-running an expensive generation.
 */
export function fingerprintCase(jd: string, companyUrl: string, days: number): string {
  const normalized = `${jd.trim()}::${companyUrl.trim().toLowerCase()}::${days}`;
  return createHash("sha256").update(normalized).digest("hex");
}
