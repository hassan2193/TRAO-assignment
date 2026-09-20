import * as cheerio from "cheerio";

export interface ExtractedLink {
  href: string;
  text: string;
}

export interface ExtractedPage {
  title: string;
  text: string;
  links: ExtractedLink[];
}

const NOISE_SELECTORS = ["script", "style", "noscript", "svg", "iframe", "nav", "footer", "header", "form"];

/**
 * Extracts readable text and outgoing links from a raw HTML page. Strips
 * script/style/nav noise and collapses whitespace rather than doing full
 * "readability" article extraction, which is enough for company/careers
 * pages that are mostly prose and lists, not long-form articles.
 */
export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);

  // Links are gathered before noise stripping: nav/header/footer are the
  // single most common place a "Careers" link lives, so removing them
  // first (as we do for readable text) would blind the crawler to exactly
  // the pages it's trying to find.
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const rawHref = $(el).attr("href");
    if (!rawHref) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(rawHref.trim())) return;
    let absolute: string;
    try {
      absolute = new URL(rawHref, baseUrl).toString();
    } catch {
      return;
    }
    absolute = absolute.split("#")[0];
    if (seen.has(absolute)) return;
    seen.add(absolute);
    links.push({ href: absolute, text: $(el).text().trim().slice(0, 120) });
  });

  const title = $("title").first().text().trim() || $("h1").first().text().trim();

  NOISE_SELECTORS.forEach((sel) => $(sel).remove());
  const text = $("body")
    .text()
    .replace(/ /g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 20000);

  return { title, text, links };
}
