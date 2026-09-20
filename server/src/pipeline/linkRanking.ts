import type { ExtractedLink } from "../services/htmlExtract.js";

const HIRING_KEYWORDS = [
  "career", "careers", "jobs", "job", "hiring", "hire", "join-us", "join-our",
  "work-with-us", "life-at", "openings", "positions", "interview", "interviewing",
  "handbook", "recruit", "recruiting", "talent",
];

const ABOUT_KEYWORDS = [
  "about", "company", "who-we-are", "mission", "culture", "story", "team", "values",
];

const ENGINEERING_KEYWORDS = ["engineering", "eng-blog", "engblog", "tech-blog"];

const BLOCKED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".css", ".js", ".zip", ".ico", ".mp4", ".webp"];

const BLOCKED_PATH_HINTS = [
  "privacy", "terms", "cookie", "login", "signin", "sign-in", "logout", "cart",
  "checkout", "wp-admin", "wp-content", "/tag/", "/tags/", "unsubscribe",
];

export type PageCategory = "hiring" | "about" | "engineering" | "other";

export function categorizeUrl(url: string, linkText = ""): PageCategory {
  const haystack = `${url} ${linkText}`.toLowerCase();
  if (HIRING_KEYWORDS.some((k) => haystack.includes(k))) return "hiring";
  if (ENGINEERING_KEYWORDS.some((k) => haystack.includes(k))) return "engineering";
  if (ABOUT_KEYWORDS.some((k) => haystack.includes(k))) return "about";
  return "other";
}

function isBlocked(href: string): boolean {
  const lower = href.toLowerCase();
  if (BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (BLOCKED_PATH_HINTS.some((hint) => lower.includes(hint))) return true;
  return false;
}

export interface RankedLink {
  href: string;
  score: number;
  category: PageCategory;
}

/**
 * Ranks a page's outgoing links by how likely they are to lead to hiring /
 * about / engineering-culture content. This is the "find the careers page
 * without hardcoding the path" logic: score by keyword signal in the URL
 * and anchor text, not by trying a fixed list of paths.
 */
export function rankLinks(links: ExtractedLink[], siteOrigin: string): RankedLink[] {
  const ranked: RankedLink[] = [];
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (url.origin !== siteOrigin) continue;
    if (isBlocked(link.href)) continue;

    const haystack = `${url.pathname} ${link.text}`.toLowerCase();
    let score = 0;
    for (const k of HIRING_KEYWORDS) if (haystack.includes(k)) score += 5;
    for (const k of ENGINEERING_KEYWORDS) if (haystack.includes(k)) score += 3;
    for (const k of ABOUT_KEYWORDS) if (haystack.includes(k)) score += 2;

    // Shallow paths (fewer segments) are more likely to be primary nav
    // entries (e.g. /careers) than deep content pages; slight preference.
    const depth = url.pathname.split("/").filter(Boolean).length;
    score += Math.max(0, 3 - depth) * 0.5;

    if (score === 0) continue;

    ranked.push({ href: link.href, score, category: categorizeUrl(link.href, link.text) });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
