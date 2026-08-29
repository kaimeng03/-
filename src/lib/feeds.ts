import Parser from "rss-parser";
import crypto from "crypto";
import type { Source } from "./sources";
import { translateMany } from "./translate";
import { safeFetch, readBodyWithLimit } from "./safeFetch";
import { sanitizeArticleHtml, stripToPlainText } from "./sanitizeArticleHtml";
import { rewriteImageUrls } from "./extract";
import { getHtmlAdapter } from "./adapters";
import type { Article } from "./types";

type FeedItem = Parser.Item & {
  mediaThumbnail?: { $?: { url?: string } };
  mediaContent?: { $?: { url?: string } } | { $?: { url?: string } }[];
  "content:encoded"?: string;
};

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "content:encoded"],
    ],
  },
});

// Section 7 performance limits: an unbounded feed (some publish hundreds of items)
// would mean unbounded translation calls and an ever-growing homepage.
const MAX_ARTICLES_PER_SOURCE = 40;
const MAX_TOTAL_ARTICLES = 200;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
// A "fuller" RSS body needs to clear this bar over the summary to be worth keeping
// as a fallback — otherwise content:encoded is often identical to the description.
const MIN_FEED_HTML_TEXT_LENGTH = 280;

function firstImageFromHtml(html: string): string | null {
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}

function extractThumbnail(item: FeedItem): string | null {
  const thumb = item.mediaThumbnail?.$?.url;
  if (thumb) return thumb;

  const mediaContent = item.mediaContent;
  if (Array.isArray(mediaContent)) {
    const withUrl = mediaContent.find((m) => m.$?.url);
    if (withUrl?.$?.url) return withUrl.$.url;
  } else if (mediaContent?.$?.url) {
    return mediaContent.$.url;
  }

  if (item.enclosure?.url) return item.enclosure.url;

  const html = item["content:encoded"] || item.content || item.summary || "";
  return firstImageFromHtml(html);
}

function makeId(link: string): string {
  return crypto.createHash("md5").update(link).digest("hex");
}

/** Safely parses a feed-provided date; never produces "Invalid Date" downstream. */
function safeParseDate(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

interface RawArticle {
  id: string;
  link: string;
  sourceId: string;
  sourceName: string;
  categoryId: string;
  pubDate: string | null;
  thumbnail: string | null;
  titleEn: string;
  summaryEn: string;
  feedHtmlEn: string | null;
  contentMode: "extract" | "feed-only";
}

export const FEEDS_CACHE_TAG = "feeds";

async function fetchSourceArticles(source: Source): Promise<RawArticle[]> {
  if (source.type === "html") {
    const adapter = getHtmlAdapter(source.adapter);
    if (!adapter || !source.pageUrl) {
      throw new Error(`No HTML adapter configured for source ${source.id}`);
    }
    const items = await adapter(source.pageUrl);
    return items.map((item) => ({
      id: item.id,
      link: item.link,
      sourceId: source.id,
      sourceName: source.name,
      categoryId: source.categoryId,
      pubDate: item.pubDate,
      thumbnail: item.thumbnail,
      titleEn: item.title,
      summaryEn: item.summary,
      feedHtmlEn: item.htmlEn,
      contentMode: "feed-only",
    }));
  }

  const { response } = await safeFetch(source.feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
    // Tagged so a manual refresh can call revalidateTag(FEEDS_CACHE_TAG) to force
    // a genuine re-fetch instead of serving the 15-minute-old cached response.
    next: { revalidate: 900, tags: [FEEDS_CACHE_TAG] },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buf = await readBodyWithLimit(response, MAX_FEED_BYTES);
  const xml = new TextDecoder("utf-8").decode(buf);
  const feed = await parser.parseString(xml);

  return (feed.items as FeedItem[]).slice(0, MAX_ARTICLES_PER_SOURCE).map((item) => {
    const link = item.link || "";
    const rawHtml = item["content:encoded"] || item.content || item.summary || "";
    const rawSummary = item.contentSnippet || stripToPlainText(rawHtml);

    let feedHtmlEn: string | null = null;
    const plainLength = stripToPlainText(rawHtml).length;
    if (rawHtml && plainLength >= MIN_FEED_HTML_TEXT_LENGTH) {
      const sanitized = sanitizeArticleHtml(rawHtml);
      feedHtmlEn = link ? rewriteImageUrls(sanitized, link) : sanitized;
    }

    return {
      id: makeId(link),
      link,
      sourceId: source.id,
      sourceName: source.name,
      categoryId: source.categoryId,
      pubDate: safeParseDate(item.isoDate, item.pubDate),
      thumbnail: extractThumbnail(item),
      titleEn: item.title || "(無標題)",
      summaryEn: rawSummary.slice(0, 220),
      feedHtmlEn,
      contentMode: "extract",
    };
  });
}

export interface FetchAllArticlesResult {
  articles: Article[];
  failedSourceNames: string[];
}

export async function fetchAllArticles(sources: Source[]): Promise<FetchAllArticlesResult> {
  // allSettled: one source's feed being down (network error, bad XML, non-200) must
  // never prevent the other sources' articles from showing up.
  const results = await Promise.allSettled(sources.map(fetchSourceArticles));

  const raw: RawArticle[] = [];
  const failedSourceNames: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      raw.push(...result.value);
    } else {
      console.error(`Failed to fetch feed for ${sources[i].name}:`, result.reason);
      failedSourceNames.push(sources[i].name);
    }
  });

  raw.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  const capped = raw.slice(0, MAX_TOTAL_ARTICLES);
  const articles = await translateArticles(capped);
  return { articles, failedSourceNames };
}

async function translateArticles(articles: RawArticle[]): Promise<Article[]> {
  const texts = articles.flatMap((a) => [a.titleEn, a.summaryEn]);
  const translated = await translateMany(texts);
  return articles.map((a, i) => ({
    ...a,
    titleZh: translated[i * 2] || a.titleEn,
    summaryZh: translated[i * 2 + 1] || a.summaryEn,
  }));
}
