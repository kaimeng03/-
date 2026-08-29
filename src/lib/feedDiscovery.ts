// Resolves a user-supplied URL (either a direct RSS/Atom feed, or a website homepage)
// down to a concrete, working feed URL, following the standard feed-autodiscovery flow:
//   1. Fetch the URL as-is.
//   2. If it's already RSS/Atom XML, use it directly.
//   3. If it's HTML, look for <link rel="alternate" type="application/rss+xml|atom+xml"> in the head.
//   4. Otherwise, probe a short list of common feed paths on the same origin.
// Never fabricates a feed URL: if nothing is found, it reports that clearly.
// All requests go through safeFetch, so SSRF protection and per-redirect-hop
// revalidation apply here too, not just to the RSS parser and article extractor.

import { safeFetch, readBodyWithLimit, validateUrlForFetch, UnsafeUrlError } from "./safeFetch";

const COMMON_FEED_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml"];
const FETCH_TIMEOUT_MS = 10000;
const PROBE_TIMEOUT_MS = 6000;
const MAX_DOC_BYTES = 5 * 1024 * 1024;

interface FetchedDoc {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
  finalUrl: string;
}

async function fetchDoc(url: string, timeoutMs: number): Promise<FetchedDoc | null> {
  try {
    const { response, finalUrl } = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)",
        Accept: "application/rss+xml, application/atom+xml, text/html, application/xhtml+xml, */*",
      },
      timeoutMs,
    });
    const buf = await readBodyWithLimit(response, MAX_DOC_BYTES);
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text: new TextDecoder("utf-8").decode(buf),
      finalUrl,
    };
  } catch {
    // Covers network errors, timeouts, and SSRF rejections alike — a probe
    // candidate (autodiscovery link, common path guess) failing just means "not
    // this one, try the next"; only the user's own direct input gets a specific
    // SSRF error message, checked separately in discoverFeed() below.
    return null;
  }
}

function looksLikeFeed(doc: FetchedDoc): boolean {
  if (/rss\+xml|atom\+xml/i.test(doc.contentType)) return true;
  const head = doc.text.slice(0, 2000);
  return /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head) || /<rdf:rdf/i.test(head);
}

function looksLikeHtml(doc: FetchedDoc): boolean {
  if (/html/i.test(doc.contentType)) return true;
  return /<html[\s>]/i.test(doc.text.slice(0, 500));
}

function findAutodiscoveryLink(html: string, baseUrl: string): string | null {
  const linkTagRe = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  const candidates: string[] = [];
  while ((match = linkTagRe.exec(html))) {
    const tag = match[0];
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    if (!/type=["'](application\/rss\+xml|application\/atom\+xml)["']/i.test(tag)) continue;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (hrefMatch) candidates.push(hrefMatch[1]);
  }
  for (const href of candidates) {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

export type DiscoveryResult = { ok: true; feedUrl: string } | { ok: false; error: string };

export async function discoverFeed(inputUrl: string): Promise<DiscoveryResult> {
  let parsed: URL;
  try {
    const validated = await validateUrlForFetch(inputUrl);
    parsed = validated.url;
  } catch (err) {
    return { ok: false, error: err instanceof UnsafeUrlError ? err.message : "網址格式不正確" };
  }

  const direct = await fetchDoc(parsed.toString(), FETCH_TIMEOUT_MS);
  if (!direct) {
    return { ok: false, error: "無法連線到這個網址，請確認網址是否正確" };
  }

  if (direct.ok && looksLikeFeed(direct)) {
    return { ok: true, feedUrl: direct.finalUrl };
  }

  if (direct.ok && looksLikeHtml(direct)) {
    const discoveredUrl = findAutodiscoveryLink(direct.text, direct.finalUrl);
    if (discoveredUrl) {
      const feedDoc = await fetchDoc(discoveredUrl, PROBE_TIMEOUT_MS);
      if (feedDoc && feedDoc.ok && looksLikeFeed(feedDoc)) {
        return { ok: true, feedUrl: feedDoc.finalUrl };
      }
    }
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  for (const path of COMMON_FEED_PATHS) {
    const doc = await fetchDoc(origin + path, PROBE_TIMEOUT_MS);
    if (doc && doc.ok && looksLikeFeed(doc)) {
      return { ok: true, feedUrl: doc.finalUrl };
    }
  }

  return { ok: false, error: "這個網站沒有偵測到 RSS/Atom feed，暫時無法自動加入。" };
}
