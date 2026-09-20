import { describe, expect, it } from "vitest";
import { extractPage } from "./htmlExtract.js";

describe("extractPage", () => {
  it("finds links that live inside nav/header/footer", () => {
    // Regression test: an earlier version stripped nav/header/footer
    // before reading links out of the page, which silently blinded the
    // crawler to exactly where "Careers" links usually live.
    const html = `<html><head><title>Acme</title></head><body>
      <header><a href="/careers">Careers</a></header>
      <nav><a href="/handbook/how-we-hire">How we hire</a></nav>
      <p>Some body text.</p>
      <footer><a href="/legal">Legal</a></footer>
    </body></html>`;

    const result = extractPage(html, "https://acme.example/");
    const hrefs = result.links.map((l) => l.href);
    expect(hrefs).toContain("https://acme.example/careers");
    expect(hrefs).toContain("https://acme.example/handbook/how-we-hire");
    expect(hrefs).toContain("https://acme.example/legal");
  });

  it("excludes nav/header/footer text from the readable text output", () => {
    const html = `<html><head><title>Acme</title></head><body>
      <nav>Navigation noise that should not appear in text</nav>
      <p>Real page content.</p>
    </body></html>`;
    const result = extractPage(html, "https://acme.example/");
    expect(result.text).toContain("Real page content.");
    expect(result.text).not.toContain("Navigation noise");
  });

  it("resolves relative links against the base URL and drops fragments/mailto", () => {
    const html = `<html><body>
      <a href="careers">Relative</a>
      <a href="#section">Fragment only</a>
      <a href="mailto:hi@acme.example">Email</a>
    </body></html>`;
    const result = extractPage(html, "https://acme.example/about/");
    const hrefs = result.links.map((l) => l.href);
    expect(hrefs).toEqual(["https://acme.example/about/careers"]);
  });

  it("extracts the title from <title>, falling back to <h1>", () => {
    const withTitle = extractPage("<html><head><title>Acme</title></head><body><h1>Ignored</h1></body></html>", "https://acme.example/");
    expect(withTitle.title).toBe("Acme");

    const withoutTitle = extractPage("<html><body><h1>Acme Careers</h1></body></html>", "https://acme.example/");
    expect(withoutTitle.title).toBe("Acme Careers");
  });
});
