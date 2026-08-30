// Europe PMC connector — official REST API, no API key required.
// Docs: https://europepmc.org/developers
import { safeFetchText, UnsafeUrlError } from "@/lib/safeFetch";
import { ConnectorError } from "./errors";
import type { NormalizedArticle, SourceCandidate } from "./types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const TIMEOUT_MS = 10000;
const PAGE_SIZE = 25;

interface EuropePmcResultItem {
  id: string;
  pmid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  journalIssn?: string;
  isOpenAccess?: "Y" | "N";
  firstPublicationDate?: string;
}

interface EuropePmcResponse {
  hitCount: number;
  resultList?: { result: EuropePmcResultItem[] };
}

async function callEuropePmc(query: string, pageSize = PAGE_SIZE): Promise<EuropePmcResponse> {
  const url = `${BASE}?query=${encodeURIComponent(query)}&format=json&pageSize=${pageSize}`;
  let text: string;
  try {
    const result = await safeFetchText(url, { timeoutMs: TIMEOUT_MS, headers: { Accept: "application/json" } });
    if (!result.response.ok) {
      if (result.response.status === 429) {
        throw new ConnectorError("RATE_LIMITED", "Europe PMC rate limited this request", 5);
      }
      throw new ConnectorError("PROVIDER_UNAVAILABLE", `Europe PMC HTTP ${result.response.status}`);
    }
    text = result.text;
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    if (err instanceof UnsafeUrlError) throw new ConnectorError("UNSAFE_URL", err.message);
    throw new ConnectorError("FETCH_TIMEOUT", "Europe PMC request failed or timed out");
  }

  try {
    return JSON.parse(text) as EuropePmcResponse;
  } catch {
    throw new ConnectorError("PROVIDER_UNAVAILABLE", "Europe PMC returned an unparseable response");
  }
}

function toArticle(item: EuropePmcResultItem): NormalizedArticle {
  return {
    id: `europepmc:${item.id}`,
    title: item.title,
    summary: null,
    canonicalUrl: item.doi
      ? `https://doi.org/${item.doi}`
      : `https://europepmc.org/article/${item.pmid ? "MED/" + item.pmid : "PMC/" + item.id}`,
    source: item.journalTitle || "Europe PMC",
    authors: item.authorString ? item.authorString.split(/,\s*/).filter(Boolean) : [],
    publishedAt: item.firstPublicationDate ?? (item.pubYear ? `${item.pubYear}-01-01` : null),
    thumbnail: null,
    doi: item.doi ?? null,
    pmid: item.pmid ?? null,
    language: null,
    accessType: item.isOpenAccess === "Y" ? "open_access" : "unknown",
    peerReviewed: true,
    preprint: false,
  };
}

/** Builds an Europe PMC candidate from a free-text query, journal name, or ISSN. */
export function buildEuropePmcCandidate(input: { query: string; name?: string }): SourceCandidate {
  return {
    provider: "europepmc",
    connectorType: "api",
    name: input.name || `Europe PMC: ${input.query}`,
    homepage: "https://europepmc.org",
    connectorConfig: { query: input.query },
    accessType: "unknown",
    contentType: "journal",
  };
}

export async function previewEuropePmc(query: string): Promise<NormalizedArticle[]> {
  const data = await callEuropePmc(query, 10);
  const items = data.resultList?.result ?? [];
  if (items.length === 0) throw new ConnectorError("NO_RESULTS", "Europe PMC returned no results for this query");
  return items.map(toArticle);
}

export async function fetchEuropePmcArticles(query: string): Promise<NormalizedArticle[]> {
  const data = await callEuropePmc(query, PAGE_SIZE);
  return (data.resultList?.result ?? []).map(toArticle);
}
