import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { assertPublicHttpUrl } from "./safeFetch";
import type { ExtractedContent } from "./types";

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

  return {
    title: parsedArticle.title || "",
    byline: parsedArticle.byline || null,
    html: rewriteImageUrls(parsedArticle.content, parsed.toString()),
    siteName: parsedArticle.siteName || null,
  };
}
