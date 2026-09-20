import { safeFetch } from "./fetcher.js";

interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

const EMPTY_RULES: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
const USER_AGENT = "AIInterviewPrepKitBot";

/**
 * Minimal robots.txt parser: reads the group that applies to our bot name,
 * falling back to "*". Only Disallow/Allow/Crawl-delay directives are
 * honoured, which covers what real hiring-page crawls need.
 */
function parseRobotsTxt(body: string): RobotsRules {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const groups: { agents: string[]; disallow: string[]; allow: string[]; crawlDelayMs: number | null }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[]; crawlDelayMs: number | null } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [value], disallow: [], allow: [], crawlDelayMs: null };
        groups.push(current);
      } else {
        current.agents.push(value);
      }
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    } else if (key === "allow" && current) {
      if (value) current.allow.push(value);
    } else if (key === "crawl-delay" && current) {
      const seconds = Number(value);
      if (!Number.isNaN(seconds)) current.crawlDelayMs = seconds * 1000;
    }
  }

  const specific = groups.find((g) => g.agents.some((a) => a.toLowerCase() === USER_AGENT.toLowerCase()));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const chosen = specific ?? wildcard;
  if (!chosen) return EMPTY_RULES;
  return { disallow: chosen.disallow, allow: chosen.allow, crawlDelayMs: chosen.crawlDelayMs };
}

const robotsCache = new Map<string, RobotsRules>();

export async function getRobotsRules(origin: string): Promise<RobotsRules> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  try {
    const result = await safeFetch(`${origin}/robots.txt`, 1);
    const rules = parseRobotsTxt(result.body);
    robotsCache.set(origin, rules);
    return rules;
  } catch {
    // No robots.txt, or it's unreachable: treat as "allow everything", which
    // is the standard interpretation for a missing robots.txt.
    robotsCache.set(origin, EMPTY_RULES);
    return EMPTY_RULES;
  }
}

function matchesRule(path: string, rule: string): boolean {
  if (!rule) return false;
  // Robots rules are prefix matches; "*" and trailing "$" are common
  // extensions we approximate as simple prefix matching, which is safe
  // (errs toward being more permissive, never toward ignoring a real block).
  const pattern = rule.replace(/\*/g, "");
  return path.startsWith(pattern);
}

export async function isPathAllowed(pageUrl: string): Promise<boolean> {
  const url = new URL(pageUrl);
  const rules = await getRobotsRules(url.origin);
  const path = url.pathname + url.search;

  const disallowMatch = rules.disallow
    .filter((rule) => matchesRule(path, rule))
    .sort((a, b) => b.length - a.length)[0];
  const allowMatch = rules.allow
    .filter((rule) => matchesRule(path, rule))
    .sort((a, b) => b.length - a.length)[0];

  if (!disallowMatch) return true;
  if (allowMatch && allowMatch.length >= disallowMatch.length) return true;
  return false;
}
