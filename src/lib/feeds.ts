import Parser from "rss-parser";
import crypto from "crypto";
import type { Source } from "./sources";
import { translateMany } from "./translate";
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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId(link: string): string {
  return crypto.createHash("md5").update(link).digest("hex");
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
}

export const FEEDS_CACHE_TAG = "feeds";

async function fetchSourceArticles(source: Source): Promise<RawArticle[]> {
  const res = await fetch(source.feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
    // Tagged so a manual refresh can call revalidateTag(FEEDS_CACHE_TAG) to force
    // a genuine re-fetch instead of serving the 15-minute-old cached response.
    next: { revalidate: 900, tags: [FEEDS_CACHE_TAG] },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const xml = await res.text();
  const feed = await parser.parseString(xml);
  return (feed.items as FeedItem[]).map((item) => {
    const link = item.link || "";
    const rawSummary = item.contentSnippet || stripHtml(item.summary || item.content || "");
    return {
      id: makeId(link),
      link,
      sourceId: source.id,
      sourceName: source.name,
      categoryId: source.categoryId,
      pubDate: item.isoDate || item.pubDate || null,
      thumbnail: extractThumbnail(item),
      titleEn: item.title || "(無標題)",
      summaryEn: rawSummary.slice(0, 220),
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

  const articles = await translateArticles(raw);
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
