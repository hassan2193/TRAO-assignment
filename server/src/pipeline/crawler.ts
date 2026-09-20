import { env } from "../config/env.js";
import { createLimiter } from "../services/concurrencyLimiter.js";
import { extractPage } from "../services/htmlExtract.js";
import { FetchFailedError, safeFetch } from "../services/fetcher.js";
import { isPathAllowed } from "../services/robots.js";
import { UnsafeUrlError } from "../services/urlSafety.js";
import { rankLinks, categorizeUrl, type PageCategory } from "./linkRanking.js";

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
  category: PageCategory;
}

export interface SkippedPage {
  url: string;
  reason: string;
}

export interface CrawlResult {
  homepageReachable: boolean;
  pages: CrawledPage[];
  skipped: SkippedPage[];
}

const MIN_SPACING_MS = 250;

/**
 * Crawls a company site starting from its homepage, discovering hiring /
 * about / engineering pages by following and ranking links rather than
 * guessing a fixed set of paths. Unreachable or disallowed pages are
 * skipped and recorded, never fatal to the run.
 */
export async function crawlSite(startUrl: string, maxPages = env.crawlMaxPages): Promise<CrawlResult> {
  const skipped: SkippedPage[] = [];
  const pages: CrawledPage[] = [];
  const visited = new Set<string>();
  const limit = createLimiter(env.crawlConcurrency, MIN_SPACING_MS);

  let siteOrigin: string;
  try {
    siteOrigin = new URL(startUrl).origin;
  } catch {
    return { homepageReachable: false, pages: [], skipped: [{ url: startUrl, reason: "Invalid URL" }] };
  }

  async function fetchAndExtract(url: string, category: PageCategory): Promise<void> {
    if (visited.has(url) || pages.length >= maxPages) return;
    visited.add(url);

    try {
      const allowed = await isPathAllowed(url);
      if (!allowed) {
        skipped.push({ url, reason: "Disallowed by robots.txt" });
        return;
      }
      const result = await safeFetch(url);
      const extracted = extractPage(result.body, url);
      pages.push({
        url,
        title: extracted.title,
        text: extracted.text,
        category: category === "other" ? categorizeUrl(url, extracted.title) : category,
      });
    } catch (err) {
      const reason =
        err instanceof FetchFailedError || err instanceof UnsafeUrlError
          ? `${err.code}: ${err.message}`
          : (err as Error).message;
      skipped.push({ url, reason });
    }
  }

  // Hop 1: homepage.
  await fetchAndExtract(startUrl, "other");
  const homepageReachable = pages.length > 0 || skipped.every((s) => s.url !== startUrl);
  if (pages.length === 0) {
    return { homepageReachable: false, pages, skipped };
  }

  // Rank links found on every page fetched so far, prioritising
  // hiring/about/engineering signals, and fetch the best candidates
  // (bounded concurrency, polite spacing) until the page budget runs out.
  const candidateScores = new Map<string, number>();
  const candidateCategory = new Map<string, PageCategory>();

  async function discoverAndQueue(url: string): Promise<{ href: string; score: number; category: PageCategory }[]> {
    try {
      const result = await safeFetch(url);
      const extracted = extractPage(result.body, url);
      return rankLinks(extracted.links, siteOrigin);
    } catch {
      return [];
    }
  }

  const initialLinks = await discoverAndQueue(startUrl);
  for (const link of initialLinks) {
    const prev = candidateScores.get(link.href) ?? -Infinity;
    if (link.score > prev) {
      candidateScores.set(link.href, link.score);
      candidateCategory.set(link.href, link.category);
    }
  }

  let frontier = [...candidateScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([href]) => href)
    .filter((href) => !visited.has(href));

  const hop1Budget = Math.max(0, maxPages - pages.length);
  const hop1 = frontier.slice(0, hop1Budget);
  await Promise.all(hop1.map((href) => limit(() => fetchAndExtract(href, candidateCategory.get(href) ?? "other"))));

  // Hop 2: from newly fetched high-signal pages (e.g. a careers index),
  // discover further links (e.g. individual role/handbook pages) if budget
  // remains, again ranked rather than hardcoded.
  if (pages.length < maxPages) {
    const secondHopSources = pages.filter((p) => p.category === "hiring" || p.category === "about").slice(0, 3);
    const secondLinks: { href: string; score: number; category: PageCategory }[] = [];
    for (const source of secondHopSources) {
      const links = await discoverAndQueue(source.url);
      secondLinks.push(...links);
    }
    const remainingBudget = Math.max(0, maxPages - pages.length);
    const nextFrontier = secondLinks
      .filter((l) => !visited.has(l.href))
      .sort((a, b) => b.score - a.score)
      .slice(0, remainingBudget);
    await Promise.all(nextFrontier.map((l) => limit(() => fetchAndExtract(l.href, l.category))));
  }

  return { homepageReachable, pages, skipped };
}
