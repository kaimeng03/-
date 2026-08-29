import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const extractArticleMock = vi.fn();
vi.mock("@/lib/extract", async () => {
  const actual = await vi.importActual<typeof import("@/lib/extract")>("@/lib/extract");
  return {
    ...actual,
    extractArticle: (...args: unknown[]) => extractArticleMock(...args),
  };
});

vi.mock("@/lib/translate", () => ({
  translateText: vi.fn(async (s: string) => `ZH:${s}`),
  translateMany: vi.fn(async (texts: string[]) => texts.map((t) => `ZH:${t}`)),
}));

import { POST } from "./route";
import { translateText, translateMany } from "@/lib/translate";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  extractArticleMock.mockReset();
  vi.mocked(translateText).mockReset().mockImplementation(async (s: string) => `ZH:${s}`);
  vi.mocked(translateMany).mockReset().mockImplementation(async (texts: string[]) => texts.map((t) => `ZH:${t}`));
});

describe("POST /api/content — feedOnly", () => {
  it("never calls extractArticle when feedOnly is true", async () => {
    const res = await POST(
      makeRequest({
        url: "https://www.twarchitect.org.tw/page_news/#news-abc",
        feedOnly: true,
        feedHtmlEn: "<p>Some real news paragraph text.</p>",
        titleEn: "Some headline",
        titleZh: "某標題",
      }),
    );
    expect(extractArticleMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.status).toBe("feed-content");
  });

  it("sanitizes feedHtmlEn (strips script tags) even in feedOnly mode", async () => {
    const res = await POST(
      makeRequest({
        url: "https://www.twarchitect.org.tw/page_news/#news-xyz",
        feedOnly: true,
        feedHtmlEn: '<p>Real content</p><script>alert(1)</script>',
        titleEn: "Headline",
        titleZh: "標題",
      }),
    );
    const data = await res.json();
    expect(data.htmlEn).not.toContain("<script");
    expect(data.htmlEn).toContain("Real content");
  });

  it("falls back to the sanitized original htmlEn when translation fails", async () => {
    vi.mocked(translateMany).mockRejectedValueOnce(new Error("translate service down"));
    const res = await POST(
      makeRequest({
        url: "https://www.twarchitect.org.tw/page_news/#news-1",
        feedOnly: true,
        feedHtmlEn: "<p>Original English paragraph.</p>",
        titleEn: "Headline",
        titleZh: "標題",
      }),
    );
    const data = await res.json();
    expect(data.status).toBe("feed-content");
    expect(data.htmlZh).toContain("Original English paragraph.");
  });

  it("returns summary-only (not a listing-page scrape) when feedHtmlEn is missing", async () => {
    const res = await POST(
      makeRequest({
        url: "https://www.twarchitect.org.tw/page_news/#news-2",
        feedOnly: true,
        feedHtmlEn: null,
        titleEn: "Headline only",
        titleZh: "只有標題",
      }),
    );
    expect(extractArticleMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.status).toBe("summary-only");
    expect(data.htmlEn).toBeNull();
  });

  it("still calls extractArticle for normal (non-feedOnly) RSS articles", async () => {
    extractArticleMock.mockResolvedValue({
      status: "full",
      titleEn: "Real Article",
      titleZh: "真實文章",
      byline: null,
      htmlEn: "<p>full</p>",
      htmlZh: "<p>全文</p>",
      siteName: null,
    });
    const res = await POST(
      makeRequest({
        url: "https://www.archdaily.com/12345/some-house",
        titleEn: "Real Article",
        titleZh: "真實文章",
      }),
    );
    expect(extractArticleMock).toHaveBeenCalledWith("https://www.archdaily.com/12345/some-house");
    const data = await res.json();
    expect(data.status).toBe("full");
  });
});
