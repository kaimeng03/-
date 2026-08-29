import { describe, it, expect } from "vitest";
import { matchHtmlSourceAdapter } from "./match";

describe("matchHtmlSourceAdapter", () => {
  const expected = {
    adapter: "twarchitect",
    pageUrl: "https://www.twarchitect.org.tw/page_news/",
    homepage: "https://www.twarchitect.org.tw/page_news/",
  };

  it("matches the canonical URL", () => {
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/page_news/")).toEqual(expected);
  });

  it("matches without a trailing slash", () => {
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/page_news")).toEqual(expected);
  });

  it("matches http:// and normalizes to https canonical", () => {
    expect(matchHtmlSourceAdapter("http://www.twarchitect.org.tw/page_news/")).toEqual(expected);
  });

  it("matches without the www subdomain", () => {
    expect(matchHtmlSourceAdapter("https://twarchitect.org.tw/page_news/")).toEqual(expected);
  });

  it("matches with a query string and/or hash", () => {
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/page_news/?ref=home")).toEqual(expected);
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/page_news/#top")).toEqual(expected);
    expect(
      matchHtmlSourceAdapter("https://www.twarchitect.org.tw/page_news?ref=home#top"),
    ).toEqual(expected);
  });

  it("does not match other pages on the same site", () => {
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/")).toBeNull();
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/feed/")).toBeNull();
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/page_news/some-article")).toBeNull();
    expect(matchHtmlSourceAdapter("https://www.twarchitect.org.tw/about/")).toBeNull();
  });

  it("does not match an unrelated domain even with the same path", () => {
    expect(matchHtmlSourceAdapter("https://example.com/page_news/")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(matchHtmlSourceAdapter("not a url")).toBeNull();
    expect(matchHtmlSourceAdapter("ftp://www.twarchitect.org.tw/page_news/")).toBeNull();
  });
});
