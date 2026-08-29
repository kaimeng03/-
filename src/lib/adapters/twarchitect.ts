// HTML adapter for 建築師雜誌 (twarchitect.org.tw)'s /page_news/ listing page.
//
// This page has no RSS/Atom feed and no per-item permalink — verified by fetching
// it directly (see PR notes): it's a single WordPress `<article class="margin-t-10">`
// containing several `.row.page-news` blocks, one per news item, each with a <h2>
// title, a body column of <p> paragraphs, and a thumbnail either in a dedicated
// <ul><li><img></li></ul> or inline inside the body paragraphs. There is no
// published-date element anywhere on the page.
//
// Kept isolated here (not folded into the generic RSS parser) so a structure change
// on this one site only requires updating this one file.

import { JSDOM, VirtualConsole } from "jsdom";
import crypto from "crypto";
import { safeFetchText } from "../safeFetch";
import { sanitizeArticleHtml, stripToPlainText } from "../sanitizeArticleHtml";
import { resolveImageUrl } from "../imageResolve";
import { rewriteImageUrls } from "../extract";
import type { HtmlAdapterArticle } from "./types";

const ARTICLE_SELECTOR = "article.margin-t-10, article";
const MAX_ITEMS = 30;

function stableIdFor(title: string, index: number): string {
  return crypto.createHash("md5").update(`twarchitect:${index}:${title}`).digest("hex");
}

export async function fetchTwarchitectNews(pageUrl: string): Promise<HtmlAdapterArticle[]> {
  const { text, finalUrl } = await safeFetchText(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 900, tags: ["feeds"] },
  });
  return parseTwarchitectNews(text, finalUrl);
}

/** Parsing is separated from fetching so it can be exercised against a saved HTML
 *  fixture in tests, without depending on the live site being reachable/unchanged.
 *
 *  The live page's per-item wrapper <div class="row ... page-news"> is missing its
 *  closing tag (a real markup bug on the site, verified against the live HTML), so
 *  every item after the first ends up nested inside the previous one in the parsed
 *  DOM instead of as a sibling. A selector like ".row.page-news" only ever matches
 *  the outermost one. <h2> titles and <p> paragraphs ARE each properly closed
 *  though, so this walks the article's full descendant list in document order —
 *  which stays correct regardless of the broken div nesting — and buckets
 *  everything between one <h2> and the next as that item's content. */
export function parseTwarchitectNews(html: string, baseUrl: string): HtmlAdapterArticle[] {
  const dom = new JSDOM(html, { url: baseUrl, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  const article = doc.querySelector(ARTICLE_SELECTOR);
  if (!article) return [];

  const flat = Array.from(article.querySelectorAll("*"));
  const h2Indexes = flat.reduce<number[]>((acc, el, i) => {
    if (el.tagName === "H2") acc.push(i);
    return acc;
  }, []);

  const results: HtmlAdapterArticle[] = [];
  h2Indexes.slice(0, MAX_ITEMS).forEach((startIdx, order) => {
    const endIdx = h2Indexes[order + 1] ?? flat.length;
    const title = (flat[startIdx].textContent || "").replace(/\s+/g, " ").trim();
    if (!title) return; // an item with no title isn't a usable article

    const segment = flat.slice(startIdx + 1, endIdx);
    const paragraphs = segment.filter((el) => el.tagName === "P");
    const bodyHtml = paragraphs.map((p) => p.outerHTML).join("");
    const plainText = stripToPlainText(bodyHtml);
    if (plainText.length < 10) return; // no real body content — skip rather than fabricate

    let thumbnail: string | null = null;
    for (const el of segment) {
      if (el.tagName === "IMG" || el.tagName === "SOURCE") {
        const url = resolveImageUrl(el, baseUrl);
        if (url) {
          thumbnail = url;
          break;
        }
      }
    }

    const id = stableIdFor(title, order);
    // No per-item permalink exists on this page — a stable in-page fragment is the
    // most honest "link" available, rather than reusing the listing URL for every
    // item (which would collide) or inventing a fake per-article URL.
    const link = `${baseUrl.split("#")[0]}#news-${id}`;
    const sanitized = sanitizeArticleHtml(rewriteImageUrls(bodyHtml, baseUrl));

    results.push({
      id,
      link,
      title,
      pubDate: null, // genuinely not present on this page — not guessed
      summary: plainText.slice(0, 220),
      thumbnail,
      htmlEn: sanitized,
    });
  });
  return results;
}
