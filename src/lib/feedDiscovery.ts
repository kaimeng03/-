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
import { findFeedLinks } from "./connectors/htmlLinks";
import { officialFeedCandidates } from "./connectors/officialFeeds";
import { stripTrackingParams } from "./connectors/trackingParams";

const COMMON_FEED_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml"];
const FETCH_TIMEOUT_MS = 10000;
const PROBE_TIMEOUT_MS = 3500;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const PROBE_CONCURRENCY = 4;

interface FetchedDoc {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
  finalUrl: string;
  retryAfter?: number;
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
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text: new TextDecoder("utf-8").decode(buf),
      finalUrl,
      ...(Number.isFinite(retryAfter) ? { retryAfter } : {}),
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

/** Finds the first working <link rel="alternate"> feed, trying every
 *  candidate (not just the first) since a page can list a non-working one
 *  first (e.g. a comments feed) before the real article feed. */
async function findAutodiscoveryLink(html: string, baseUrl: string): Promise<string | null> {
  const candidates = findFeedLinks(html, baseUrl);
  for (const href of candidates) {
    const doc = await fetchDoc(href, PROBE_TIMEOUT_MS);
    if (doc && doc.ok && looksLikeFeed(doc)) return doc.finalUrl;
  }
  return null;
}

/** Common feed paths to probe, both at the site origin and — when the input
 *  URL has its own path, e.g. https://example.com/blog/ — relative to that
 *  path too (so /blog/feed, /blog/rss.xml etc are tried, not just /feed). */
function candidateFeedPaths(parsed: URL): string[] {
  const origin = `${parsed.protocol}//${parsed.host}`;
  const paths = new Set<string>();

  // A URL such as /section/news is often a section directory even without a
  // trailing slash. Probe both /section/news/feed and the parent /section/feed.
  // The set keeps the bounded list deduplicated.
  const fullPath = parsed.pathname.replace(/\/+$/, "");
  if (fullPath) {
    const base = origin + fullPath;
    for (const p of COMMON_FEED_PATHS) paths.add(base + p);
  }

  for (const p of COMMON_FEED_PATHS) paths.add(origin + p);

  const dirPath = parsed.pathname.endsWith("/") ? parsed.pathname : parsed.pathname.replace(/[^/]*$/, "");
  if (dirPath && dirPath !== "/") {
    const base = origin + dirPath.replace(/\/+$/, "");
    for (const p of COMMON_FEED_PATHS) paths.add(base + p);
  }
  return [...paths].slice(0, 12);
}

export type DiscoveryResult =
  | { ok: true; feedUrl: string }
  | { ok: false; error: string; retryAfter?: number };

export interface DiscoverFeedOptions {
  probeCommonPaths?: boolean;
}

export async function discoverFeed(inputUrl: string, options: DiscoverFeedOptions = {}): Promise<DiscoveryResult> {
  const cleanedUrl = stripTrackingParams(inputUrl.trim());

  let parsed: URL;
  try {
    const validated = await validateUrlForFetch(cleanedUrl);
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

  if (!direct.ok) {
    if (direct.status === 429) return { ok: false, error: "RATE_LIMITED", retryAfter: direct.retryAfter };
    if (direct.status === 401) return { ok: false, error: "LOGIN_REQUIRED" };
    if (direct.status === 403) return { ok: false, error: "ACCESS_BLOCKED" };
  }

  if (direct.ok && looksLikeHtml(direct)) {
    const discoveredUrl = await findAutodiscoveryLink(direct.text, direct.finalUrl);
    if (discoveredUrl) {
      return { ok: true, feedUrl: discoveredUrl };
    }
  }

  // Some publishers host feeds on a separate official domain and omit the
  // standard <link rel="alternate"> marker. Try only narrowly reviewed rules,
  // and verify every candidate's response before accepting it.
  for (const candidate of officialFeedCandidates(parsed)) {
    const doc = await fetchDoc(candidate, PROBE_TIMEOUT_MS);
    if (doc && doc.ok && looksLikeFeed(doc)) {
      return { ok: true, feedUrl: doc.finalUrl };
    }
  }

  if (options.probeCommonPaths !== false) {
    const candidates = candidateFeedPaths(parsed);
    for (let start = 0; start < candidates.length; start += PROBE_CONCURRENCY) {
      const docs = await Promise.all(
        candidates.slice(start, start + PROBE_CONCURRENCY).map((path) => fetchDoc(path, PROBE_TIMEOUT_MS)),
      );
      const match = docs.find((doc) => doc && doc.ok && looksLikeFeed(doc));
      if (match) {
        return { ok: true, feedUrl: match.finalUrl };
      }
    }
  }

  return { ok: false, error: "這個網站沒有偵測到 RSS/Atom feed，暫時無法自動加入。" };
}
