import { describe, it, expect } from "vitest";
import { findFeedLinks, parseSitemapLocs } from "./htmlLinks";

describe("findFeedLinks — real HTML parsing, not regex", () => {
  it("finds a <link rel=alternate type=rss> feed", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`;
    expect(findFeedLinks(html, "https://example.com/blog/")).toEqual(["https://example.com/feed.xml"]);
  });

  it("handles rel with multiple whitespace-separated tokens", () => {
    const html = `<html><head><link rel="alternate nofollow" type="application/atom+xml" href="/atom.xml"></head></html>`;
    expect(findFeedLinks(html, "https://example.com/")).toEqual(["https://example.com/atom.xml"]);
  });

  it("does not depend on attribute order", () => {
    const html = `<html><head><link href="/feed.xml" type="application/rss+xml" rel="alternate"></head></html>`;
    expect(findFeedLinks(html, "https://example.com/")).toEqual(["https://example.com/feed.xml"]);
  });

  it("resolves relative hrefs against <base href>", () => {
    const html = `<html><head><base href="https://cdn.example.com/site/"><link rel="alternate" type="application/rss+xml" href="feed.xml"></head></html>`;
    expect(findFeedLinks(html, "https://example.com/")).toEqual(["https://cdn.example.com/site/feed.xml"]);
  });

  it("resolves relative hrefs against the page URL when there is no <base>", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="../feed.xml"></head></html>`;
    expect(findFeedLinks(html, "https://example.com/blog/post/")).toEqual(["https://example.com/blog/feed.xml"]);
  });

  it("ignores <link> tags that aren't alternate rss/atom feeds", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/style.css">
      <link rel="alternate" type="text/html" href="/amp">
      <link rel="icon" href="/favicon.ico">
    </head></html>`;
    expect(findFeedLinks(html, "https://example.com/")).toEqual([]);
  });

  it("collects multiple candidates in document order", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/comments.xml">
      <link rel="alternate" type="application/rss+xml" href="/posts.xml">
    </head></html>`;
    expect(findFeedLinks(html, "https://example.com/")).toEqual([
      "https://example.com/comments.xml",
      "https://example.com/posts.xml",
    ]);
  });

  it("returns an empty array for malformed input rather than throwing", () => {
    expect(findFeedLinks("<<<not html", "https://example.com/")).toEqual([]);
  });
});

describe("parseSitemapLocs", () => {
  it("extracts <loc> entries from a sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`;
    expect(parseSitemapLocs(xml)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("returns an empty array when there are no <loc> entries", () => {
    expect(parseSitemapLocs("<urlset></urlset>")).toEqual([]);
  });
});
