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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  const feedHtmlEn = typeof body?.feedHtmlEn === "string" ? body.feedHtmlEn : null;
  const titleEnFallback = typeof body?.titleEn === "string" ? body.titleEn : "";
  const titleZhFallback = typeof body?.titleZh === "string" ? body.titleZh : "";

  if (!url) {
    return Response.json({ error: "缺少 url 參數" }, { status: 400, headers: JSON_HEADERS });
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

      if (feedHtmlEn) {
        try {
          const sanitized = sanitizeArticleHtml(feedHtmlEn);
          const [titleZh, htmlZh] = await Promise.all([
            titleEnFallback ? translateText(titleEnFallback).catch(() => titleZhFallback || titleEnFallback) : "",
            translateFeedHtml(sanitized),
          ]);
          const result: ExtractedContent = {
            status: "feed-content",
            titleEn: titleEnFallback,
            titleZh: titleZh || titleZhFallback || titleEnFallback,
            byline: null,
            htmlEn: sanitized,
            htmlZh: sanitizeArticleHtml(htmlZh),
            siteName: null,
            gate: err.gate,
          };
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (fallbackErr) {
          console.error("Feed-content fallback translation failed:", fallbackErr);
          // Fall through to summary-only below rather than failing the request.
        }
      }

      const result: ExtractedContent = {
        status: "summary-only",
        titleEn: titleEnFallback,
        titleZh: titleZhFallback || titleEnFallback,
        byline: null,
        htmlEn: null,
        htmlZh: null,
        siteName: null,
        gate: err.gate,
      };
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
