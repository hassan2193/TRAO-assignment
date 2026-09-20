import * as cheerio from "cheerio";
import { safeFetch, FetchFailedError } from "../services/fetcher.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Looks for public discussion of a company's interview process via
 * DuckDuckGo's HTML endpoint (no API key required — DuckDuckGo's terms
 * permit this lightweight, low-volume, non-commercial usage; this is the
 * "genuine free tier" search path documented in the README). Never throws:
 * search is inherently best-effort, so a failure or empty result set just
 * means "public discussion not found," which is an honest, valid outcome.
 */
export async function searchPublicDiscussion(companyName: string): Promise<SearchResult[]> {
  const query = `"${companyName}" interview process questions site:glassdoor.com OR site:reddit.com OR site:blind.com OR site:levels.fyi`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const result = await safeFetch(url, 1);
    const $ = cheerio.load(result.body);
    const results: SearchResult[] = [];

    $(".result").each((_, el) => {
      if (results.length >= 5) return;
      const linkEl = $(el).find(".result__a").first();
      const title = linkEl.text().trim();
      let href = linkEl.attr("href") ?? "";
      // DuckDuckGo's HTML endpoint wraps result links in a redirect param.
      const uddgMatch = href.match(/uddg=([^&]+)/);
      if (uddgMatch) href = decodeURIComponent(uddgMatch[1]);
      const snippet = $(el).find(".result__snippet").text().trim();
      if (title && href) {
        results.push({ title, url: href, snippet });
      }
    });

    return results;
  } catch (err) {
    if (err instanceof FetchFailedError) return [];
    return [];
  }
}
