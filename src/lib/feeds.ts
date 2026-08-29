import Parser from "rss-parser";
import crypto from "crypto";
import { SOURCES, type Source } from "./sources";
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

async function fetchSourceArticles(source: Source): Promise<Article[]> {
  try {
    const res = await fetch(source.feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    return (feed.items as FeedItem[]).map((item) => {
      const link = item.link || "";
      const rawSummary =
        item.contentSnippet || stripHtml(item.summary || item.content || "");
      return {
        id: makeId(link),
        title: item.title || "(無標題)",
        link,
        sourceId: source.id,
        sourceName: source.name,
        categoryId: source.categoryId,
        pubDate: item.isoDate || item.pubDate || null,
        summary: rawSummary.slice(0, 220),
        thumbnail: extractThumbnail(item),
      };
    });
  } catch (err) {
    console.error(`Failed to fetch feed for ${source.name}:`, err);
    return [];
  }
}

export async function fetchAllArticles(): Promise<Article[]> {
  const results = await Promise.all(SOURCES.map(fetchSourceArticles));
  const all = results.flat();
  all.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });
  return translateArticles(all);
}

async function translateArticles(articles: Article[]): Promise<Article[]> {
  const texts = articles.flatMap((a) => [a.title, a.summary]);
  const translated = await translateMany(texts);
  return articles.map((a, i) => ({
    ...a,
    title: translated[i * 2] || a.title,
    summary: translated[i * 2 + 1] || a.summary,
  }));
}
