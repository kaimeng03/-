import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns", () => ({ default: { promises: { lookup: vi.fn() } } }));
import dns from "node:dns";
const mockLookup = dns.promises.lookup as unknown as ReturnType<typeof vi.fn>;

import { previewSitemap, looksLikeSitemapUrl } from "./sitemap";
import { ConnectorError } from "./errors";

function xmlResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/xml" }),
    body: null,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

describe("looksLikeSitemapUrl", () => {
  it("recognizes common sitemap URL shapes", () => {
    expect(looksLikeSitemapUrl("https://example.com/sitemap.xml")).toBe(true);
    expect(looksLikeSitemapUrl("https://example.com/sitemap_index.xml")).toBe(true);
    expect(looksLikeSitemapUrl("https://example.com/post-sitemap.xml")).toBe(true);
  });

  it("does not misclassify an ordinary feed URL", () => {
    expect(looksLikeSitemapUrl("https://example.com/feed.xml")).toBe(false);
  });
});

describe("previewSitemap — preview only, never treated as a live feed directly", () => {
  it("returns a bounded sample of <loc> entries, not the whole sitemap", async () => {
    const urls = Array.from({ length: 30 }, (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`).join("");
    vi.stubGlobal("fetch", vi.fn(async () => xmlResponse(`<urlset>${urls}</urlset>`)));

    const preview = await previewSitemap("https://example.com/sitemap.xml");
    expect(preview.totalUrls).toBe(30);
    expect(preview.sampleUrls.length).toBeLessThan(30);
    expect(preview.isSitemapIndex).toBe(false);
    vi.unstubAllGlobals();
  });

  it("flags a sitemap index distinctly from a regular sitemap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        xmlResponse(`<sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`),
      ),
    );

    const preview = await previewSitemap("https://example.com/sitemap_index.xml");
    expect(preview.isSitemapIndex).toBe(true);
    vi.unstubAllGlobals();
  });

  it("throws INVALID_FEED when there are no <loc> entries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => xmlResponse("<urlset></urlset>")));

    await expect(previewSitemap("https://example.com/sitemap.xml")).rejects.toMatchObject({
      code: "INVALID_FEED",
    } satisfies Partial<ConnectorError>);
    vi.unstubAllGlobals();
  });
});
