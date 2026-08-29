import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { safeFetch, readBodyWithLimit } from "./safeFetch";
import { translateMany, translateText } from "./translate";
import { sanitizeArticleHtml } from "./sanitizeArticleHtml";
import { detectContentGate, type GateResult } from "./contentGate";
import type { ExtractedContent } from "./types";

const TRANSLATABLE_BLOCKS_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, figcaption, dd, dt, td, th";
const MAX_ARTICLE_BYTES = 8 * 1024 * 1024; // 8MB of HTML is already very generous

export class ContentGateError extends Error {
  gate: Exclude<GateResult, "ok">;
  constructor(gate: Exclude<GateResult, "ok">) {
    super(`Content gated: ${gate}`);
    this.name = "ContentGateError";
    this.gate = gate;
  }
}

async function translateContentBlocks(contentHtml: string): Promise<string> {
  const fragmentDom = new JSDOM(`<div id="root">${contentHtml}</div>`, {
    virtualConsole: new VirtualConsole(),
  });
  const root = fragmentDom.window.document.getElementById("root")!;
  const blocks = Array.from(root.querySelectorAll(TRANSLATABLE_BLOCKS_SELECTOR)).filter(
    (el) =>
      (el.textContent || "").trim().length > 0 &&
      !el.querySelector(TRANSLATABLE_BLOCKS_SELECTOR) &&
      // Skip blocks with nested elements (e.g. an <img> inside a <p>) — replacing
      // textContent would silently delete those child elements.
      !el.querySelector("img, svg, video, iframe"),
  );

  const texts = blocks.map((el) => el.textContent || "");
  const translated = await translateMany(texts);
  blocks.forEach((el, i) => {
    el.textContent = translated[i];
  });

  return root.innerHTML;
}

export function rewriteImageUrls(html: string, baseUrl: string): string {
  return html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const dataSrc = /\sdata-src=["']([^"']+)["']/i.exec(imgTag)?.[1];
    const dataLazySrc = /\sdata-lazy-src=["']([^"']+)["']/i.exec(imgTag)?.[1];
    const src = /\ssrc=["']([^"']+)["']/i.exec(imgTag)?.[1];
    const real = dataSrc || dataLazySrc || src;
    if (!real) return imgTag;

    let absolute: string;
    try {
      absolute = new URL(real, baseUrl).toString();
    } catch {
      return imgTag;
    }
    const proxied = `/api/image?url=${encodeURIComponent(absolute)}`;

    let tag = imgTag.replace(/\ssrcset=["'][^"']*["']/gi, "");
    if (/\ssrc=["'][^"']*["']/i.test(tag)) {
      tag = tag.replace(/\ssrc=["'][^"']*["']/i, ` src="${proxied}"`);
    } else {
      tag = tag.replace(/<img/i, `<img src="${proxied}"`);
    }
    return tag.replace(/\sloading=["']lazy["']/gi, "");
  });
}

/**
 * Attempts to fetch and extract the full article. Throws ContentGateError (not a
 * generic Error) when the page turns out to be a login wall, bot challenge, or
 * suspiciously short extraction — callers use that to fall back to RSS-provided
 * content rather than showing login-form text as if it were the article.
 */
export async function extractArticle(url: string): Promise<ExtractedContent> {
  const { response, finalUrl } = await safeFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 3600 },
  });
  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new Error(`無法讀取原始網頁 (HTTP ${response.status})`);
  }

  const buf = await readBodyWithLimit(response, MAX_ARTICLE_BYTES);
  const html = new TextDecoder("utf-8").decode(buf);

  const dom = new JSDOM(html, {
    url: finalUrl,
    virtualConsole: new VirtualConsole(),
  });
  const reader = new Readability(dom.window.document);
  const parsedArticle = reader.parse();

  const gate = detectContentGate({
    status: response.status,
    rawHtmlSample: html.slice(0, 5000),
    readabilityTitle: parsedArticle?.title ?? dom.window.document.title ?? null,
    readabilityTextLength: (parsedArticle?.textContent || "").trim().length,
  });
  if (gate !== "ok" || !parsedArticle || !parsedArticle.content) {
    throw new ContentGateError(gate === "ok" ? "too-short" : gate);
  }

  const sanitizedEn = sanitizeArticleHtml(parsedArticle.content);

  const [titleZh, contentHtmlZh] = await Promise.all([
    parsedArticle.title
      ? translateText(parsedArticle.title).catch(() => parsedArticle.title)
      : Promise.resolve(""),
    translateContentBlocks(sanitizedEn),
  ]);

  return {
    status: "full",
    titleEn: parsedArticle.title || "",
    titleZh: titleZh || parsedArticle.title || "",
    byline: parsedArticle.byline || null,
    htmlEn: rewriteImageUrls(sanitizedEn, finalUrl),
    htmlZh: rewriteImageUrls(sanitizeArticleHtml(contentHtmlZh), finalUrl),
    siteName: parsedArticle.siteName || null,
  };
}
