// Orchestrates POST /api/source-discovery: classifies free-form user input
// (URL / RSS / DOI / ISSN / journal name / keyword) and returns a preview —
// candidates + a sample of articles — WITHOUT creating anything. The caller
// only gets a real Subscription after a separate, explicit confirm step.
import { discoverFeed } from "@/lib/feedDiscovery";
import { matchHtmlSourceAdapter, getHtmlAdapter } from "@/lib/adapters";
import { safeFetch, UnsafeUrlError } from "@/lib/safeFetch";
import { stripTrackingParams } from "./trackingParams";
import { previewRssFeed } from "./genericFeed";
import { previewSitemap, looksLikeSitemapUrl, type SitemapPreview } from "./sitemap";
import { looksLikeDoi, looksLikeIssn, lookupDoi, previewCrossrefByIssn, previewCrossrefByQuery, buildCrossrefCandidate } from "./crossref";
import { previewEuropePmc, buildEuropePmcCandidate } from "./europepmc";
import { previewPubMed, buildPubMedCandidate } from "./pubmed";
import { ConnectorError } from "./errors";
import { previewGenericHtmlNews } from "@/lib/adapters/genericHtml";
import type { NormalizedArticle, SourceCandidate } from "./types";

export type DiscoveryInputType = "url" | "rss" | "doi" | "issn" | "journal_name" | "keyword";

/** Provider selection for the ISSN/keyword/journal-name paths only — a URL
 *  always goes through RSS/Atom/Sitemap/adapter discovery regardless of this,
 *  and a DOI always resolves via Crossref regardless of this. This is a
 *  connector choice, not a separate "medical" product tier. */
export type ProviderChoice = "auto" | "crossref" | "europepmc" | "pubmed";

export interface DiscoveryPreview {
  inputType: DiscoveryInputType;
  detectedUrl: string | null;
  candidate: SourceCandidate | null;
  articles: NormalizedArticle[];
  sitemap?: SitemapPreview;
}

/** Fails fast with a precise error code when the site is actively blocking
 *  automated access, rather than letting discoverFeed exhaust every probe
 *  path and report a misleading "no feed found". Never attempts to work
 *  around the block (no headless browser, no challenge-solving) — it only
 *  classifies the response so the UI can show the right message. */
async function assertNotBlocked(url: string): Promise<void> {
  try {
    const { response } = await safeFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
      timeoutMs: 10000,
    });
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      throw new ConnectorError("RATE_LIMITED", "網站目前阻擋自動讀取，無法建立可靠來源。", retryAfter);
    }
    if (response.status === 401) {
      throw new ConnectorError("LOGIN_REQUIRED", "這個網址需要登入才能存取。");
    }
    if (response.status === 403) {
      throw new ConnectorError("ACCESS_BLOCKED", "網站目前阻擋自動讀取，無法建立可靠來源。");
    }
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    if (err instanceof UnsafeUrlError) throw new ConnectorError("UNSAFE_URL", err.message);
    // Any other failure here (timeout, DNS, etc) is left for discoverFeed's
    // own attempt to surface — this pre-flight only short-circuits on a
    // clear, unambiguous block signal.
  }
}

function isUrlLike(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

/** Best-effort classification — never authoritative, just picks which
 *  connector(s) to try first. A URL is always tried as a URL regardless of
 *  what it superficially looks like. */
export function classifyInput(input: string): DiscoveryInputType {
  const trimmed = input.trim();
  if (isUrlLike(trimmed)) return "url";
  if (looksLikeDoi(trimmed)) return "doi";
  if (looksLikeIssn(trimmed)) return "issn";
  // Heuristic: short, no spaces before a comma-less multi-word phrase reads as
  // a journal/publication name; anything else is treated as a keyword search.
  if (/^[\w&'.-]+(\s+[\w&'.-]+){0,6}$/.test(trimmed) && trimmed.length <= 80) return "journal_name";
  return "keyword";
}

async function discoverUrlInput(rawUrl: string): Promise<DiscoveryPreview> {
  const cleaned = stripTrackingParams(rawUrl.trim());

  const htmlMatch = matchHtmlSourceAdapter(cleaned);
  if (htmlMatch) {
    const adapterFn = getHtmlAdapter(htmlMatch.adapter);
    if (!adapterFn) throw new ConnectorError("UNSUPPORTED_SOURCE", "No adapter registered for this site");
    let items;
    try {
      items = await adapterFn(htmlMatch.pageUrl);
    } catch {
      throw new ConnectorError("ACCESS_BLOCKED", "Could not read this site's article list");
    }
    if (!items || items.length === 0) throw new ConnectorError("NO_RESULTS", "No articles detected on this site");
    return {
      inputType: "url",
      detectedUrl: htmlMatch.pageUrl,
      candidate: {
        provider: htmlMatch.adapter,
        connectorType: "html_adapter",
        name: htmlMatch.homepage,
        homepage: htmlMatch.homepage,
        feedUrl: htmlMatch.pageUrl,
      },
      articles: items.slice(0, 5).map((item) => ({
        id: `${htmlMatch.adapter}:${item.id}`,
        title: item.title,
        summary: item.summary,
        canonicalUrl: item.link,
        source: htmlMatch.homepage,
        authors: [],
        publishedAt: item.pubDate,
        thumbnail: item.thumbnail,
        doi: null,
        pmid: null,
        language: null,
        accessType: "unknown",
        peerReviewed: null,
        preprint: null,
      })),
    };
  }

  if (looksLikeSitemapUrl(cleaned)) {
    const sitemap = await previewSitemap(cleaned);
    return {
      inputType: "url",
      detectedUrl: cleaned,
      candidate: {
        provider: "generic",
        connectorType: "sitemap",
        name: cleaned,
        homepage: cleaned,
        feedUrl: cleaned,
      },
      articles: [],
      sitemap,
    };
  }

  // A pre-flight check on the raw URL: if the site itself is actively
  // blocking automated access (429, a bot-challenge behind 403, a login
  // wall), say so precisely instead of discoverFeed's generic "no feed
  // found" — and never pretend the checkpoint page IS a feed.
  await assertNotBlocked(cleaned);

  const discovery = await discoverFeed(cleaned);
  if (!discovery.ok) {
    // Many modern public news pages (including Next.js sites) expose article
    // cards in their server-rendered HTML but publish no RSS. As a conservative
    // fallback, accept the page only when at least two same-site article links
    // can be extracted; RSS and explicit site adapters still take precedence.
    try {
      const generic = await previewGenericHtmlNews(cleaned);
      if (generic.articles.length >= 2) {
        return {
          inputType: "url",
          detectedUrl: cleaned,
          candidate: {
            provider: "generic_html",
            connectorType: "html_adapter",
            name: generic.sourceName,
            homepage: cleaned,
            feedUrl: cleaned,
            contentType: "news",
          },
          articles: generic.articles.slice(0, 5).map((item) => ({
            id: `generic-html:${item.id}`,
            title: item.title,
            summary: item.summary || null,
            canonicalUrl: item.link,
            source: generic.sourceName,
            authors: [],
            publishedAt: item.pubDate,
            thumbnail: item.thumbnail,
            doi: null,
            pmid: null,
            language: null,
            accessType: "unknown",
            peerReviewed: null,
            preprint: null,
          })),
        };
      }
    } catch {
      // Preserve the original, more useful feed-discovery error below.
    }
    // discoverFeed's own message distinguishes "no feed" from an SSRF/format
    // rejection only by text; re-derive the error code from that message so
    // API callers get a stable code, not a string to pattern-match on.
    if (discovery.error.includes("不允許存取") || discovery.error.includes("網址格式")) {
      throw new ConnectorError("UNSAFE_URL", discovery.error);
    }
    throw new ConnectorError("NO_FEED_FOUND", discovery.error);
  }

  const articles = await previewRssFeed(discovery.feedUrl);
  let homepage = discovery.feedUrl;
  try {
    const u = new URL(cleaned);
    homepage = `${u.protocol}//${u.host}`;
  } catch {
    // keep feedUrl fallback
  }

  return {
    inputType: "url",
    detectedUrl: discovery.feedUrl,
    candidate: {
      provider: "generic",
      connectorType: "rss",
      name: articles[0]?.source || homepage,
      homepage,
      feedUrl: discovery.feedUrl,
    },
    articles,
  };
}

export async function discoverSource(rawInput: string, provider: ProviderChoice = "auto"): Promise<DiscoveryPreview> {
  const trimmed = rawInput.trim();
  if (!trimmed) throw new ConnectorError("INVALID_URL", "Input is empty");
  if (trimmed.length > 500) throw new ConnectorError("INVALID_URL", "Input is too long");

  const inputType = classifyInput(trimmed);

  if (inputType === "url") {
    // A URL always goes through RSS/Atom/Sitemap/adapter discovery — the
    // provider dropdown never affects this path.
    return discoverUrlInput(trimmed);
  }

  if (inputType === "doi") {
    // DOIs always resolve via Crossref, the DOI registration agency's own API.
    const article = await lookupDoi(trimmed);
    return {
      inputType,
      detectedUrl: article.canonicalUrl,
      candidate: buildCrossrefCandidate({ query: trimmed, name: article.source }),
      articles: [article],
    };
  }

  if (inputType === "issn") {
    if (provider === "pubmed") {
      const articles = await previewPubMed(trimmed);
      return { inputType, detectedUrl: null, candidate: buildPubMedCandidate({ query: trimmed, name: articles[0]?.source }), articles };
    }
    if (provider === "europepmc") {
      const articles = await previewEuropePmc(trimmed);
      return { inputType, detectedUrl: null, candidate: buildEuropePmcCandidate({ query: trimmed, name: articles[0]?.source }), articles };
    }
    // Default (auto or explicit crossref): Crossref, keyed as a real ISSN filter.
    const articles = await previewCrossrefByIssn(trimmed);
    return {
      inputType,
      detectedUrl: null,
      candidate: buildCrossrefCandidate({ issn: trimmed, name: articles[0]?.source }),
      articles,
    };
  }

  // journal_name / keyword.
  if (provider === "pubmed") {
    const articles = await previewPubMed(trimmed);
    return { inputType, detectedUrl: null, candidate: buildPubMedCandidate({ query: trimmed }), articles };
  }
  if (provider === "europepmc") {
    const articles = await previewEuropePmc(trimmed);
    return { inputType, detectedUrl: null, candidate: buildEuropePmcCandidate({ query: trimmed }), articles };
  }
  if (provider === "crossref") {
    const articles = await previewCrossrefByQuery(trimmed);
    return { inputType, detectedUrl: null, candidate: buildCrossrefCandidate({ query: trimmed }), articles };
  }

  // provider === "auto": explicit, tested fallback order — cross-domain
  // Crossref first, then Europe PMC. Both are equal-tier connectors; neither
  // is a "medical main page".
  try {
    const articles = await previewCrossrefByQuery(trimmed);
    return {
      inputType,
      detectedUrl: null,
      candidate: buildCrossrefCandidate({ query: trimmed }),
      articles,
    };
  } catch (crossrefErr) {
    try {
      const articles = await previewEuropePmc(trimmed);
      return {
        inputType,
        detectedUrl: null,
        candidate: buildEuropePmcCandidate({ query: trimmed }),
        articles,
      };
    } catch {
      if (crossrefErr instanceof ConnectorError) throw crossrefErr;
      throw new ConnectorError("UNSUPPORTED_SOURCE", "Could not find a matching source for this input");
    }
  }
}
