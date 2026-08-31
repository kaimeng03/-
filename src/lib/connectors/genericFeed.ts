// Lightweight RSS/Atom preview — fetches a feed and returns a small sample of
// normalized articles for the discovery flow. Deliberately separate from
// src/lib/feeds.ts's fetchAllArticles pipeline (which also translates,
// caches, and caps for the live homepage) — a preview needs none of that.
import Parser from "rss-parser";
import { safeFetch, readBodyWithLimit, UnsafeUrlError } from "@/lib/safeFetch";
import { ConnectorError } from "./errors";
import type { NormalizedArticle } from "./types";

const TIMEOUT_MS = 10000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const PREVIEW_SIZE = 5;

type PreviewFeedItem = Parser.Item & {
  mediaThumbnail?: { $?: { url?: string } };
  mediaContent?: { $?: { url?: string } } | { $?: { url?: string } }[];
  "content:encoded"?: string;
};

const parser = new Parser<Record<string, unknown>, PreviewFeedItem>({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "content:encoded"],
    ],
  },
});

function firstImageFromHtml(html: string): string | null {
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}

function extractThumbnail(item: PreviewFeedItem): string | null {
  const thumbnail = item.mediaThumbnail?.$?.url;
  if (thumbnail) return thumbnail;

  if (Array.isArray(item.mediaContent)) {
    const media = item.mediaContent.find((entry) => entry.$?.url);
    if (media?.$?.url) return media.$.url;
  } else if (item.mediaContent?.$?.url) {
    return item.mediaContent.$.url;
  }

  if (item.enclosure?.url) return item.enclosure.url;
  return firstImageFromHtml(item["content:encoded"] || item.content || item.summary || "");
}

export async function previewRssFeed(feedUrl: string): Promise<NormalizedArticle[]> {
  let xml: string;
  try {
    const { response } = await safeFetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
      timeoutMs: TIMEOUT_MS,
    });
    if (!response.ok) {
      if (response.status === 429) throw new ConnectorError("RATE_LIMITED", `Feed HTTP 429`, 5);
      if (response.status === 401 || response.status === 403) {
        throw new ConnectorError("LOGIN_REQUIRED", `Feed HTTP ${response.status}`);
      }
      throw new ConnectorError("ACCESS_BLOCKED", `Feed HTTP ${response.status}`);
    }
    const buf = await readBodyWithLimit(response, MAX_FEED_BYTES);
    xml = new TextDecoder("utf-8").decode(buf);
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    if (err instanceof UnsafeUrlError) throw new ConnectorError("UNSAFE_URL", err.message);
    throw new ConnectorError("FETCH_TIMEOUT", "Feed request failed or timed out");
  }

  let feed: Parser.Output<PreviewFeedItem>;
  try {
    feed = await parser.parseString(xml);
  } catch {
    throw new ConnectorError("INVALID_FEED", "Could not parse this as RSS/Atom");
  }

  if (!feed.items || feed.items.length === 0) {
    throw new ConnectorError("INVALID_FEED", "Feed has no items");
  }

  return feed.items.slice(0, PREVIEW_SIZE).map((item) => ({
    id: `feed:${item.link || item.guid || item.title}`,
    title: item.title || "(untitled)",
    summary: item.contentSnippet || null,
    canonicalUrl: item.link || feedUrl,
    source: feed.title || feedUrl,
    authors: item.creator ? [item.creator] : [],
    publishedAt: item.isoDate || item.pubDate || null,
    thumbnail: extractThumbnail(item),
    doi: null,
    pmid: null,
    language: null,
    accessType: "unknown" as const,
    peerReviewed: null,
    preprint: null,
  }));
}
