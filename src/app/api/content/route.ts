import { NextRequest } from "next/server";
import { extractArticle, ContentGateError } from "@/lib/extract";
import { sanitizeArticleHtml } from "@/lib/sanitizeArticleHtml";
import { translateText, translateMany } from "@/lib/translate";
import { JSDOM, VirtualConsole } from "jsdom";
import type { ExtractedContent } from "@/lib/types";

export const runtime = "nodejs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

async function translateFeedHtml(html: string): Promise<string> {
  const dom = new JSDOM(`<div id="root">${html}</div>`, { virtualConsole: new VirtualConsole() });
  const root = dom.window.document.getElementById("root")!;
  const blocks = Array.from(root.querySelectorAll("p, h1, h2, h3, li, figcaption, blockquote")).filter(
    (el) => (el.textContent || "").trim().length > 0 && !el.querySelector("img, svg, video, iframe"),
  );
  const texts = blocks.map((el) => el.textContent || "");
  const translated = await translateMany(texts);
  blocks.forEach((el, i) => {
    el.textContent = translated[i];
  });
  return root.innerHTML;
}

/** Sanitizes feedHtmlEn and translates it, producing a feed-content (or, if there's
 *  no feed HTML at all, summary-only) response. Shared by the feedOnly path (for
 *  adapters with no distinct article page) and the gated-extraction
 *  fallback path (RSS sources whose live page turned out to be a login wall etc). */
async function buildFeedContentResponse(params: {
  feedHtmlEn: string | null;
  titleEn: string;
  titleZh: string;
  gate?: ExtractedContent["gate"];
}): Promise<ExtractedContent> {
  const { feedHtmlEn, titleEn, titleZh, gate } = params;

  if (feedHtmlEn) {
    try {
      const sanitized = sanitizeArticleHtml(feedHtmlEn);
      const [translatedTitle, htmlZh] = await Promise.all([
        titleEn ? translateText(titleEn).catch(() => titleZh || titleEn) : "",
        translateFeedHtml(sanitized).catch(() => sanitized), // fall back to the sanitized original on translation failure
      ]);
      return {
        status: "feed-content",
        titleEn,
        titleZh: translatedTitle || titleZh || titleEn,
        byline: null,
        htmlEn: sanitized,
        htmlZh: sanitizeArticleHtml(htmlZh),
        siteName: null,
        gate,
      };
    } catch (err) {
      console.error("feed-content build failed, falling back to summary-only:", err);
    }
  }

  return {
    status: "summary-only",
    titleEn,
    titleZh: titleZh || titleEn,
    byline: null,
    htmlEn: null,
    htmlZh: null,
    siteName: null,
    gate,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  const feedHtmlEn = typeof body?.feedHtmlEn === "string" ? body.feedHtmlEn : null;
  const titleEnFallback = typeof body?.titleEn === "string" ? body.titleEn : "";
  const titleZhFallback = typeof body?.titleZh === "string" ? body.titleZh : "";
  const feedOnly = body?.feedOnly === true;

  if (!url) {
    return Response.json({ error: "缺少 url 參數" }, { status: 400, headers: JSON_HEADERS });
  }

  // HTML-adapter sources (e.g. twarchitect's /page_news/ listing): the adapter
  // already scraped the one news item's content when the article list was built.
  // There's no separate per-article page to fetch, and `url` here actually points
  // back at the shared listing page — calling extractArticle(url) would scrape and
  // Readability-parse THAT ENTIRE LISTING as if it were one article, mixing in
  // every other news item, the site nav, etc. So this path must never reach
  // extractArticle at all.
  if (feedOnly) {
    const result = await buildFeedContentResponse({
      feedHtmlEn,
      titleEn: titleEnFallback,
      titleZh: titleZhFallback,
    });
    return Response.json(result, { headers: JSON_HEADERS });
  }

  try {
    const article = await extractArticle(url);
    return Response.json(article, { headers: JSON_HEADERS });
  } catch (err) {
    // Never forward raw upstream error text/stacks to the client — log the real
    // cause server-side and only ever send back our own known-safe fields. `gate`
    // is a short machine-readable reason, not display text, so the client can
    // render it in whichever language the reader currently has selected.
    if (err instanceof ContentGateError) {
      console.warn(`Content gated (${err.gate}) for ${url}`);
      const result = await buildFeedContentResponse({
        feedHtmlEn,
        titleEn: titleEnFallback,
        titleZh: titleZhFallback,
        gate: err.gate,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    }

    console.error(`Article extraction failed for ${url}:`, err);
    const result: ExtractedContent = {
      status: "unavailable",
      titleEn: titleEnFallback,
      titleZh: titleZhFallback || titleEnFallback,
      byline: null,
      htmlEn: null,
      htmlZh: null,
      siteName: null,
      gate: "client-error",
    };
    return Response.json(result, { headers: JSON_HEADERS });
  }
}
