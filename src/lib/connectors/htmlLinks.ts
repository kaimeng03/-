import { JSDOM, VirtualConsole } from "jsdom";

/**
 * Real HTML parsing (not regex) for <link rel="alternate"> feed autodiscovery.
 * Handles multi-token rel="..." values, any attribute order, relative hrefs,
 * and an explicit <base href> — none of which a hand-rolled regex reliably
 * covers. Scripts are never executed (no `runScripts` option) and console
 * output from the parsed page is discarded via VirtualConsole, matching the
 * same safe-parsing pattern already used in extract.ts / twarchitect.ts.
 */
export function findFeedLinks(html: string, baseUrl: string): string[] {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: baseUrl, virtualConsole: new VirtualConsole() });
  } catch {
    return [];
  }

  const doc = dom.window.document;
  const base = doc.querySelector("base[href]")?.getAttribute("href") || baseUrl;

  const links = Array.from(doc.querySelectorAll("link[rel]"));
  const candidates: string[] = [];
  for (const link of links) {
    const relTokens = (link.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    if (!relTokens.includes("alternate")) continue;
    const type = (link.getAttribute("type") || "").toLowerCase();
    if (type !== "application/rss+xml" && type !== "application/atom+xml") continue;
    const href = link.getAttribute("href");
    if (!href) continue;
    try {
      candidates.push(new URL(href, base).toString());
    } catch {
      // malformed href — skip it, don't guess
    }
  }
  return candidates;
}

/** Extracts every <loc> URL from a sitemap or sitemap-index XML document. */
export function parseSitemapLocs(xml: string): string[] {
  let dom: JSDOM;
  try {
    dom = new JSDOM(xml, { contentType: "text/xml", virtualConsole: new VirtualConsole() });
  } catch {
    return [];
  }
  const locs = Array.from(dom.window.document.querySelectorAll("loc"));
  return locs.map((el) => el.textContent?.trim()).filter((v): v is string => Boolean(v));
}
