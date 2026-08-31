import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns", () => ({
  default: { promises: { lookup: vi.fn() } },
}));

import dns from "node:dns";
import { previewRssFeed } from "./genericFeed";

const mockLookup = dns.promises.lookup as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

describe("generic RSS preview", () => {
  it("keeps publisher media thumbnails in the confirmation preview", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel><title>BBC Chinese</title>
          <item><title>測試文章</title><link>https://example.com/articles/1</link>
            <media:thumbnail url="https://images.example.com/news.jpg" />
          </item>
        </channel>
      </rss>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } }),
      ),
    );

    const articles = await previewRssFeed("https://example.com/feed.xml");
    expect(articles[0]).toMatchObject({
      source: "BBC Chinese",
      thumbnail: "https://images.example.com/news.jpg",
    });
    vi.unstubAllGlobals();
  });

  it("unwraps publisher CDATA text that was serialized literally", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Medical News</title>
      <item><title>&lt;![CDATA[Readable medical headline]]&gt;</title>
        <link>https://example.com/view/article</link>
        <description>&lt;![CDATA[Readable medical summary.]]&gt;</description>
      </item></channel></rss>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } })),
    );

    const articles = await previewRssFeed("https://example.com/rss.xml");
    expect(articles[0]).toMatchObject({
      title: "Readable medical headline",
      summary: "Readable medical summary.",
    });
    vi.unstubAllGlobals();
  });
});
