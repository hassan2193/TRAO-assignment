import { env } from "../config/env.js";
import { assertSafeUrl, UnsafeUrlError } from "./urlSafety.js";

export class FetchFailedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "FetchFailedError";
  }
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];
const MAX_REDIRECTS = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(rawUrl: string): Promise<SafeFetchResult> {
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const url = await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.fetchTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "AIInterviewPrepKitBot/1.0 (+research; respects robots.txt)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new FetchFailedError("TIMEOUT", `Timed out fetching ${url}`);
      }
      throw new FetchFailedError("NETWORK_ERROR", `Network error fetching ${url}: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FetchFailedError("BAD_REDIRECT", `Redirect from ${url} had no Location header`);
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }

    if (response.status >= 500) {
      throw new FetchFailedError("SERVER_ERROR", `${url} returned ${response.status}`);
    }
    if (response.status === 429) {
      throw new FetchFailedError("RATE_LIMITED", `${url} returned 429`);
    }
    if (response.status >= 400) {
      throw new FetchFailedError("HTTP_ERROR", `${url} returned ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new FetchFailedError("UNSUPPORTED_CONTENT_TYPE", `${url} has unsupported content-type ${contentType}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > env.maxResponseBytes) {
      throw new FetchFailedError("TOO_LARGE", `${url} exceeds max response size`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { url: url.toString(), status: response.status, contentType, body: text };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > env.maxResponseBytes) {
          await reader.cancel();
          throw new FetchFailedError("TOO_LARGE", `${url} exceeded max response size while streaming`);
        }
        chunks.push(value);
      }
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return { url: url.toString(), status: response.status, contentType, body };
  }

  throw new FetchFailedError("TOO_MANY_REDIRECTS", `Exceeded ${MAX_REDIRECTS} redirects fetching ${rawUrl}`);
}

const TRANSIENT_CODES = new Set(["TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR", "RATE_LIMITED"]);

/**
 * Fetches a URL with SSRF protection, size/content-type limits, manual
 * redirect validation, and bounded retry with exponential backoff for
 * transient failures (timeouts, 5xx, 429). Never throws for a page that is
 * simply unreachable after retries — callers decide whether to skip it.
 */
export async function safeFetch(rawUrl: string, maxRetries = 2): Promise<SafeFetchResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOnce(rawUrl);
    } catch (err) {
      lastError = err as Error;
      const code = err instanceof FetchFailedError ? err.code : err instanceof UnsafeUrlError ? err.code : "";
      if (err instanceof UnsafeUrlError) {
        throw err; // never retry a blocked target
      }
      if (!TRANSIENT_CODES.has(code) || attempt === maxRetries) {
        throw err;
      }
      const backoffMs = 300 * 2 ** attempt + Math.floor(Math.random() * 150);
      await sleep(backoffMs);
    }
  }
  throw lastError ?? new FetchFailedError("UNKNOWN", `Failed to fetch ${rawUrl}`);
}
