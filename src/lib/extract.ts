import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { assertPublicHttpUrl } from "./safeFetch";
import { translateMany, translateText } from "./translate";
import type { ExtractedContent } from "./types";

const TRANSLATABLE_BLOCKS_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, figcaption, dd, dt, td, th";

async function translateContentBlocks(contentHtml: string): Promise<string> {
  const fragmentDom = new JSDOM(`<div id="root">${contentHtml}</div>`, {
    virtualConsole: new VirtualConsole(),
  });
  const root = fragmentDom.window.document.getElementById("root")!;
  const blocks = Array.from(root.querySelectorAll(TRANSLATABLE_BLOCKS_SELECTOR)).filter(
    (el) => (el.textContent || "").trim().length > 0 && !el.querySelector(TRANSLATABLE_BLOCKS_SELECTOR),
  );

  const texts = blocks.map((el) => el.textContent || "");
  const translated = await translateMany(texts);
  blocks.forEach((el, i) => {
    el.textContent = translated[i];
  });

  return root.innerHTML;
}

function rewriteImageUrls(html: string, baseUrl: string): string {
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

export async function extractArticle(url: string): Promise<ExtractedContent> {
  const parsed = assertPublicHttpUrl(url);

  const res = await fetch(parsed.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`無法讀取原始網頁 (HTTP ${res.status})`);
  }
  const html = await res.text();

  const dom = new JSDOM(html, {
    url: parsed.toString(),
    virtualConsole: new VirtualConsole(),
  });
  const reader = new Readability(dom.window.document);
  const parsedArticle = reader.parse();
  if (!parsedArticle || !parsedArticle.content) {
    throw new Error("無法擷取完整內文");
  }

  const [translatedTitle, translatedContentHtml] = await Promise.all([
    parsedArticle.title
      ? translateText(parsedArticle.title).catch(() => parsedArticle.title)
      : Promise.resolve(""),
    translateContentBlocks(parsedArticle.content),
  ]);

  return {
    title: translatedTitle || parsedArticle.title || "",
    byline: parsedArticle.byline || null,
    html: rewriteImageUrls(translatedContentHtml, parsed.toString()),
    siteName: parsedArticle.siteName || null,
  };
}
