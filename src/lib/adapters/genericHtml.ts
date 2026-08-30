// Conservative fallback for public news/listing pages that do not publish RSS.
// It only accepts same-site links that look like individual articles and needs
// at least two usable items, so a normal navigation page is not mistaken for a
// news source. Site-specific adapters and RSS remain the preferred paths.

import crypto from "crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { safeFetchText } from "../safeFetch";
import { sanitizeArticleHtml } from "../sanitizeArticleHtml";
import { resolveImageUrl } from "../imageResolve";
import type { HtmlAdapterArticle } from "./types";

const MAX_ITEMS = 40;
const MIN_ITEMS = 2;
const ARTICLE_LINK_SELECTORS = [
  "article a[href]",
  '[class*="article" i] a[href]',
  '[class*="news" i] a[href]',
  '[class*="card" i] a[href]',
  "main a[href]",
];

const EXCLUDED_PATH_PARTS = new Set([
  "about", "account", "advertise", "author", "category", "contact", "login",
  "privacy", "search", "signin", "signup", "tag", "terms",
]);

export interface GenericHtmlPreview {
  sourceName: string;
  articles: HtmlAdapterArticle[];
}

function cleanText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function articleId(url: string): string {
  return crypto.createHash("md5").update(`generic-html:${url}`).digest("hex");
}

function looksLikeArticleUrl(url: URL, pageUrl: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.hostname !== pageUrl.hostname) return false;
  if (url.pathname.replace(/\/+$/, "") === pageUrl.pathname.replace(/\/+$/, "")) return false;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts.some((part) => EXCLUDED_PATH_PARTS.has(part.toLowerCase()))) return false;

  const last = parts.at(-1) || "";
  return /^\d{4,}$/.test(last) || /[a-z\d]+(?:-[a-z\d]+){2,}/i.test(last) || last.length >= 18;
}

function nearestCard(anchor: Element): Element {
  return anchor.closest('article, li, [class*="card" i], [class*="article" i], [class*="item" i]') || anchor;
}

function titleFrom(anchor: Element, card: Element): string {
  const heading = card.querySelector("h1, h2, h3, h4");
  const image = card.querySelector("img");
  return cleanText(heading?.textContent || anchor.textContent || image?.getAttribute("alt"));
}

function dateFrom(card: Element): string | null {
  const raw = card.querySelector("time")?.getAttribute("datetime") || card.querySelector("time")?.textContent;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseGenericHtmlListing(html: string, baseUrl: string): GenericHtmlPreview {
  const dom = new JSDOM(html, { url: baseUrl, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  const pageUrl = new URL(baseUrl);
  const sourceName = cleanText(
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ||
      doc.querySelector("title")?.textContent ||
      pageUrl.hostname,
  ).slice(0, 160);

  const anchors = Array.from(doc.querySelectorAll(ARTICLE_LINK_SELECTORS.join(",")));
  const seen = new Set<string>();
  const articles: HtmlAdapterArticle[] = [];

  for (const anchor of anchors) {
    if (articles.length >= MAX_ITEMS) break;
    const href = anchor.getAttribute("href");
    if (!href) continue;

    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|gbraid$)/i.test(key)) url.searchParams.delete(key);
    }
    const canonicalUrl = url.toString();
    if (seen.has(canonicalUrl) || !looksLikeArticleUrl(url, pageUrl)) continue;

    const card = nearestCard(anchor);
    let title = titleFrom(anchor, card);
    // Some server-rendered card links expose their href as trailing accessible
    // text. Keep the human headline without the duplicated `/section/12345`.
    if (title.endsWith(url.pathname)) title = cleanText(title.slice(0, -url.pathname.length));
    if (title.length < 8 || title.length > 220) continue;

    const summary = cleanText(card.querySelector("p")?.textContent).slice(0, 220);
    const imageElement = card.querySelector("img, source");
    const thumbnail = imageElement ? resolveImageUrl(imageElement, baseUrl) : null;
    const htmlEn = summary ? sanitizeArticleHtml(`<p>${summary}</p>`) : "";

    seen.add(canonicalUrl);
    articles.push({
      id: articleId(canonicalUrl),
      link: canonicalUrl,
      title,
      pubDate: dateFrom(card),
      summary,
      thumbnail,
      htmlEn,
      // Generic listings only accept real, distinct article URLs. Let the
      // existing content endpoint fetch + Readability-parse that page; htmlEn
      // remains a safe summary fallback when a site later blocks extraction.
      contentMode: "extract",
    });
  }

  return { sourceName, articles: articles.length >= MIN_ITEMS ? articles : [] };
}

export async function previewGenericHtmlNews(pageUrl: string): Promise<GenericHtmlPreview> {
  const { text, finalUrl } = await safeFetchText(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NewskillReader/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 900, tags: ["feeds"] },
  });
  return parseGenericHtmlListing(text, finalUrl);
}

export async function fetchGenericHtmlNews(pageUrl: string): Promise<HtmlAdapterArticle[]> {
  return (await previewGenericHtmlNews(pageUrl)).articles;
}
