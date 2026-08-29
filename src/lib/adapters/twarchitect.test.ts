import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseTwarchitectNews } from "./twarchitect";

const fixtureHtml = readFileSync(
  join(__dirname, "__fixtures__", "twarchitect-page-news.html"),
  "utf-8",
);
const PAGE_URL = "https://www.twarchitect.org.tw/page_news/";

describe("parseTwarchitectNews (fixture: real /page_news/ HTML)", () => {
  const items = parseTwarchitectNews(fixtureHtml, PAGE_URL);

  it("extracts multiple distinct news items, not the whole page as one article", () => {
    expect(items.length).toBeGreaterThan(3);
  });

  it("gives every item a real, non-empty title", () => {
    for (const item of items) {
      expect(item.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("finds the expected known headline from the fixture", () => {
    expect(items.some((i) => i.title.includes("威尼斯建築雙年展"))).toBe(true);
  });

  it("never fabricates a publish date — the page genuinely has none per item", () => {
    for (const item of items) {
      expect(item.pubDate).toBeNull();
    }
  });

  it("gives every item a unique id and a unique link (no collisions)", () => {
    const ids = items.map((i) => i.id);
    const links = items.map((i) => i.link);
    expect(new Set(ids).size).toBe(items.length);
    expect(new Set(links).size).toBe(items.length);
  });

  it("does not reuse the bare listing URL as every item's link", () => {
    for (const item of items) {
      expect(item.link).not.toBe(PAGE_URL);
      expect(item.link.startsWith(PAGE_URL)).toBe(true);
    }
  });

  it("resolves thumbnails to absolute https URLs when present", () => {
    const withThumb = items.filter((i) => i.thumbnail);
    expect(withThumb.length).toBeGreaterThan(0);
    for (const item of withThumb) {
      expect(item.thumbnail).toMatch(/^https:\/\//);
    }
  });

  it("produces sanitized HTML with no script tags or event handlers", () => {
    for (const item of items) {
      expect(item.htmlEn).not.toContain("<script");
      expect(item.htmlEn).not.toMatch(/on\w+=/i);
    }
  });

  it("rewrites body image srcs through the image proxy", () => {
    const withImgInBody = items.find((i) => i.htmlEn.includes("<img"));
    expect(withImgInBody).toBeDefined();
    expect(withImgInBody!.htmlEn).toContain("/api/image?url=");
  });

  it("gives each item a non-trivial summary", () => {
    for (const item of items) {
      expect(item.summary.length).toBeGreaterThan(10);
    }
  });
});
