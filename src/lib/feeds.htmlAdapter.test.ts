import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Source } from "./sources";

const getHtmlAdapterMock = vi.fn();
vi.mock("./adapters", () => ({
  getHtmlAdapter: (...args: unknown[]) => getHtmlAdapterMock(...args),
}));
vi.mock("./translate", () => ({
  translateMany: vi.fn(async (texts: string[]) => texts),
}));

import { fetchAllArticles } from "./feeds";

function htmlSource(adapter: string): Source {
  return {
    id: adapter,
    name: adapter,
    homepage: `https://${adapter}.example.com`,
    feedUrl: "",
    categoryId: "cat-1",
    type: "html",
    adapter,
    pageUrl: `https://${adapter}.example.com/news`,
  };
}

beforeEach(() => getHtmlAdapterMock.mockReset());

describe("HTML adapter article content mode", () => {
  it("preserves extract for generic websites with distinct article URLs", async () => {
    getHtmlAdapterMock.mockReturnValue(async () => [{
      id: "a1",
      link: "https://news.example.com/story/12345",
      title: "A public news story",
      pubDate: null,
      summary: "A summary",
      thumbnail: "https://news.example.com/image.jpg",
      htmlEn: "<p>A summary</p>",
      contentMode: "extract",
    }]);

    const result = await fetchAllArticles([htmlSource("generic_html")]);
    expect(result.articles[0]).toMatchObject({
      link: "https://news.example.com/story/12345",
      contentMode: "extract",
      thumbnail: "https://news.example.com/image.jpg",
    });
  });

  it("keeps legacy single-page adapters feed-only by default", async () => {
    getHtmlAdapterMock.mockReturnValue(async () => [{
      id: "a2",
      link: "https://single-page.example.com/news#item",
      title: "An embedded news item",
      pubDate: null,
      summary: "Embedded content",
      thumbnail: null,
      htmlEn: "<p>Embedded content</p>",
    }]);

    const result = await fetchAllArticles([htmlSource("twarchitect")]);
    expect(result.articles[0]?.contentMode).toBe("feed-only");
  });
});
