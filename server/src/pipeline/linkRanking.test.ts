import { describe, expect, it } from "vitest";
import { rankLinks, categorizeUrl } from "./linkRanking.js";

describe("rankLinks", () => {
  const origin = "https://acme.example";

  it("ranks a nonstandard hiring-handbook path above an unrelated page, without any hardcoded path list", () => {
    const links = [
      { href: "https://acme.example/handbook/how-we-hire", text: "Our Handbook" },
      { href: "https://acme.example/product", text: "Product" },
    ];
    const ranked = rankLinks(links, origin);
    expect(ranked[0].href).toBe("https://acme.example/handbook/how-we-hire");
    expect(ranked[0].category).toBe("hiring");
  });

  it("drops links to a different origin", () => {
    const links = [{ href: "https://other.example/careers", text: "Careers" }];
    expect(rankLinks(links, origin)).toEqual([]);
  });

  it("drops blocked file types and boilerplate pages", () => {
    const links = [
      { href: "https://acme.example/careers.pdf", text: "Careers PDF" },
      { href: "https://acme.example/privacy", text: "Privacy policy" },
      { href: "https://acme.example/wp-admin/careers", text: "Careers" },
    ];
    expect(rankLinks(links, origin)).toEqual([]);
  });

  it("excludes a deep link with no relevant keyword and no shallow-path bonus", () => {
    const links = [{ href: "https://acme.example/blog/2024/03/random-post-xyz", text: "Random" }];
    expect(rankLinks(links, origin)).toEqual([]);
  });
});

describe("categorizeUrl", () => {
  it("recognizes hiring, about, and engineering signals from the URL alone", () => {
    expect(categorizeUrl("https://acme.example/careers")).toBe("hiring");
    expect(categorizeUrl("https://acme.example/about")).toBe("about");
    expect(categorizeUrl("https://acme.example/engineering-blog")).toBe("engineering");
    expect(categorizeUrl("https://acme.example/pricing")).toBe("other");
  });
});
