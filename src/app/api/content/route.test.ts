import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

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
import { auth } from "@/auth";

const mockedAuth = vi.mocked(auth);

function fakeSession(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as Session;
}

function makeRequest(
  body: unknown,
  options: { origin?: string | null; contentLength?: string | null } = {},
): NextRequest {
  const origin = "origin" in options ? options.origin : "https://example.com";
  return {
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "origin") return origin ?? null;
        if (name.toLowerCase() === "content-length") return options.contentLength ?? null;
        return null;
      },
    },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  extractArticleMock.mockReset();
  vi.mocked(translateText).mockReset().mockImplementation(async (s: string) => `ZH:${s}`);
  vi.mocked(translateMany).mockReset().mockImplementation(async (texts: string[]) => texts.map((t) => `ZH:${t}`));
  mockedAuth.mockReset().mockResolvedValue(fakeSession() as never);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/content — feedOnly", () => {
  it("rejects an untrusted origin before doing extraction work", async () => {
    const res = await POST(makeRequest({ url: "https://example.com/a" }, { origin: "https://evil.example.net" }));
    expect(res.status).toBe(403);
    expect(extractArticleMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({ url: "https://example.com/a" }));
    expect(res.status).toBe(401);
    expect(extractArticleMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared request before parsing JSON", async () => {
    const json = vi.fn();
    const req = makeRequest({ url: "https://example.com/a" }, { contentLength: "1100001" });
    Object.assign(req, { json });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(json).not.toHaveBeenCalled();
  });

  it("returns private no-store responses", async () => {
    const res = await POST(makeRequest({ url: "https://example.com/a", feedOnly: true }));
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

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
