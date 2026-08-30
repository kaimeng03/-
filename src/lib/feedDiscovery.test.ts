import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns", () => ({
  default: { promises: { lookup: vi.fn() } },
}));

import dns from "node:dns";
import { discoverFeed } from "./feedDiscovery";

const mockLookup = dns.promises.lookup as unknown as ReturnType<typeof vi.fn>;

function xmlResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/rss+xml" }),
    body: null,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

function htmlResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "text/html" }),
    body: null,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

function notFoundResponse(status = 404) {
  return {
    ok: false,
    status,
    headers: new Headers({ "content-type": "text/html" }),
    body: null,
    arrayBuffer: async () => new TextEncoder().encode("").buffer,
  } as unknown as Response;
}

const RSS_XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><item><title>Hi</title></item></channel></rss>`;

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

describe("discoverFeed — tracking params are stripped before any request is made", () => {
  it("fetches the cleaned URL, not the one with tracking params", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url.toString());
        return xmlResponse(RSS_XML);
      }),
    );

    const result = await discoverFeed("https://example.com/feed.xml?utm_source=newsletter&utm_medium=email");
    expect(result.ok).toBe(true);
    expect(calls[0]).toBe("https://example.com/feed.xml");
    vi.unstubAllGlobals();
  });
});

describe("discoverFeed — RSS/Atom autodiscovery via real HTML parsing", () => {
  it("finds a feed linked via <link rel=alternate> on the homepage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://example.com/") {
          return htmlResponse(`<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`);
        }
        if (url === "https://example.com/feed.xml") return xmlResponse(RSS_XML);
        return notFoundResponse();
      }),
    );

    const result = await discoverFeed("https://example.com/");
    expect(result).toEqual({ ok: true, feedUrl: "https://example.com/feed.xml" });
    vi.unstubAllGlobals();
  });

  it("probes /blog/feed and similar paths relative to the page, not just the origin root", async () => {
    const attempted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        attempted.push(url.toString());
        if (url === "https://example.com/blog/") return htmlResponse(`<html><head></head></html>`);
        if (url === "https://example.com/blog/feed") return xmlResponse(RSS_XML);
        return notFoundResponse();
      }),
    );

    const result = await discoverFeed("https://example.com/blog/");
    expect(result).toEqual({ ok: true, feedUrl: "https://example.com/blog/feed" });
    expect(attempted).toContain("https://example.com/blog/feed");
    vi.unstubAllGlobals();
  });

  it("reports NO_FEED when nothing is found, without fabricating a URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => notFoundResponse()));

    const result = await discoverFeed("https://example.com/nothing-here");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("沒有偵測到");
    vi.unstubAllGlobals();
  });

  it("does not treat a 429 response as a valid feed and does not fabricate success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => notFoundResponse(429)));

    const result = await discoverFeed("https://example.com/blocked");
    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("discoverFeed — SSRF protection is still enforced (delegates to safeFetch)", () => {
  it("rejects a hostname that resolves to a private IP", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1" }]);
    vi.stubGlobal("fetch", vi.fn(async () => xmlResponse(RSS_XML)));

    const result = await discoverFeed("https://internal.example.com/feed.xml");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("不允許存取");
    vi.unstubAllGlobals();
  });
});
