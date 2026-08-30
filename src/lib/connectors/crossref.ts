// Crossref connector — official REST API, no API key required. Cross-domain:
// usable for health, education, architecture, tech, finance, law, etc — not
// health-specific. Docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
import { safeFetchText, UnsafeUrlError } from "@/lib/safeFetch";
import { ConnectorError } from "./errors";
import type { NormalizedArticle, SourceCandidate } from "./types";

const BASE = "https://api.crossref.org/works";
const TIMEOUT_MS = 10000;
const PAGE_SIZE = 20;

function mailtoParam(): string {
  // Crossref's "polite pool" gets better, more consistent service for
  // requests that identify themselves — never a secret, just an email.
  return process.env.CROSSREF_MAILTO ? `&mailto=${encodeURIComponent(process.env.CROSSREF_MAILTO)}` : "";
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  "container-title"?: string[];
  URL?: string;
  author?: CrossrefAuthor[];
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  language?: string;
}

interface CrossrefListResponse {
  status: string;
  message: { items: CrossrefWork[]; "total-results"?: number };
}

interface CrossrefWorkResponse {
  status: string;
  message: CrossrefWork;
}

async function crossrefFetch(url: string): Promise<string> {
  try {
    const result = await safeFetchText(url, { timeoutMs: TIMEOUT_MS, headers: { Accept: "application/json" } });
    if (!result.response.ok) {
      if (result.response.status === 404) throw new ConnectorError("NO_RESULTS", "Crossref found no matching work");
      if (result.response.status === 429) throw new ConnectorError("RATE_LIMITED", "Crossref rate limited this request", 5);
      throw new ConnectorError("PROVIDER_UNAVAILABLE", `Crossref HTTP ${result.response.status}`);
    }
    return result.text;
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    if (err instanceof UnsafeUrlError) throw new ConnectorError("UNSAFE_URL", err.message);
    throw new ConnectorError("FETCH_TIMEOUT", "Crossref request failed or timed out");
  }
}

function datePartsToIso(dp?: number[][]): string | null {
  const parts = dp?.[0];
  if (!parts || parts.length === 0) return null;
  const [y, m = 1, d = 1] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toArticle(work: CrossrefWork): NormalizedArticle {
  return {
    id: `crossref:${work.DOI}`,
    title: work.title?.[0] || "(untitled)",
    summary: null,
    canonicalUrl: work.URL || `https://doi.org/${work.DOI}`,
    source: work["container-title"]?.[0] || "Crossref",
    authors: (work.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    publishedAt:
      datePartsToIso(work.published?.["date-parts"]) ??
      datePartsToIso(work["published-print"]?.["date-parts"]) ??
      datePartsToIso(work["published-online"]?.["date-parts"]),
    thumbnail: null,
    doi: work.DOI,
    pmid: null,
    language: work.language ?? null,
    accessType: "unknown",
    peerReviewed: true,
    preprint: false,
  };
}

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

export function looksLikeDoi(input: string): boolean {
  return DOI_PATTERN.test(input.trim());
}

/** Direct DOI lookup — /works/{doi}, not a search. */
export async function lookupDoi(doi: string): Promise<NormalizedArticle> {
  const mailto = mailtoParam();
  const url = `${BASE}/${encodeURIComponent(doi.trim())}${mailto ? `?${mailto.slice(1)}` : ""}`;
  const text = await crossrefFetch(url);
  let data: CrossrefWorkResponse;
  try {
    data = JSON.parse(text) as CrossrefWorkResponse;
  } catch {
    throw new ConnectorError("PROVIDER_UNAVAILABLE", "Crossref returned an unparseable response");
  }
  return toArticle(data.message);
}

async function searchWorks(queryParam: string, rows: number): Promise<NormalizedArticle[]> {
  const text = await crossrefFetch(`${BASE}?${queryParam}&rows=${rows}${mailtoParam()}`);
  let data: CrossrefListResponse;
  try {
    data = JSON.parse(text) as CrossrefListResponse;
  } catch {
    throw new ConnectorError("PROVIDER_UNAVAILABLE", "Crossref returned an unparseable response");
  }
  const items = data.message.items ?? [];
  if (items.length === 0) throw new ConnectorError("NO_RESULTS", "Crossref returned no results for this query");
  return items.map(toArticle);
}

export function buildCrossrefCandidate(input: { query?: string; issn?: string; name?: string }): SourceCandidate {
  const label = input.issn ?? input.query ?? "";
  return {
    provider: "crossref",
    connectorType: "api",
    name: input.name || `Crossref: ${label}`,
    homepage: "https://www.crossref.org",
    // ISSN and free-text query are stored under distinct keys — fetchCrossrefArticles
    // (src/lib/feeds.ts) and previewCrossrefByIssn/Query both key off which one is set.
    connectorConfig: input.issn ? { issn: input.issn } : { query: input.query },
    accessType: "unknown",
    contentType: "journal",
  };
}

export async function previewCrossrefByIssn(issn: string): Promise<NormalizedArticle[]> {
  return searchWorks(`filter=issn:${encodeURIComponent(issn.trim())}`, 10);
}

export async function previewCrossrefByQuery(query: string): Promise<NormalizedArticle[]> {
  return searchWorks(`query=${encodeURIComponent(query)}`, 10);
}

export async function fetchCrossrefArticles(config: { query?: string; issn?: string }): Promise<NormalizedArticle[]> {
  if (config.issn) return searchWorks(`filter=issn:${encodeURIComponent(config.issn)}`, PAGE_SIZE);
  if (config.query) return searchWorks(`query=${encodeURIComponent(config.query)}`, PAGE_SIZE);
  return [];
}

const ISSN_PATTERN = /^\d{4}-\d{3}[\dXx]$/;

export function looksLikeIssn(input: string): boolean {
  return ISSN_PATTERN.test(input.trim());
}
