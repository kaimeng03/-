import { describe, expect, it } from "vitest";
import { parseGenericHtmlListing } from "./genericHtml";

describe("generic HTML news listing fallback", () => {
  it("extracts same-site article cards with titles, images and stable links", () => {
    const html = `<!doctype html><html><head><title>Health News</title>
      <meta property="og:site_name" content="Health 2.0"></head><body><main>
      <a href="/search/diabetes/articles">Search diabetes</a>
      <article><a href="/medical/365599"><img src="/images/a.webp" alt="Article image"><h2>First public medical news article</h2></a><p>First summary.</p></article>
      <article><a href="/medical/365594"><h2>Second public medical news article</h2></a><p>Second summary.</p></article>
      <article><a href="/medical/365594"><h2>Second public medical news article</h2></a></article>
      </main></body></html>`;

    const result = parseGenericHtmlListing(html, "https://health.example.com/medical");

    expect(result.sourceName).toBe("Health 2.0");
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0]).toMatchObject({
      title: "First public medical news article",
      link: "https://health.example.com/medical/365599",
      thumbnail: "https://health.example.com/images/a.webp",
      contentMode: "extract",
    });
    expect(result.articles.some((a) => a.link.includes("/search/"))).toBe(false);
  });

  it("rejects an ordinary navigation page with fewer than two article links", () => {
    const html = `<main><a href="/about">About us</a><article><a href="/news/12345"><h2>Only one possible article</h2></a></article></main>`;
    expect(parseGenericHtmlListing(html, "https://example.com/").articles).toEqual([]);
  });
});
