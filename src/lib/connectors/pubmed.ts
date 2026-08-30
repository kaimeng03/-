// PubMed connector — official NCBI E-utilities, no API key required (but
// supported). Docs: https://www.ncbi.nlm.nih.gov/home/develop/api/
import { safeFetchText, UnsafeUrlError } from "@/lib/safeFetch";
import { ConnectorError } from "./errors";
import type { NormalizedArticle, SourceCandidate } from "./types";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const TIMEOUT_MS = 10000;
const PAGE_SIZE = 20;

// NCBI asks for at most 3 requests/second without an API key (more with one,
// but we stay conservative and polite regardless — this is a shared,
// server-wide limit, not per-request/per-user).
const MIN_INTERVAL_MS = 350;
let lastCallAt = 0;
let queue: Promise<void> = Promise.resolve();

async function throttle(): Promise<void> {
  const runNext = queue.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  queue = runNext;
  return runNext;
}

function ncbiParams(): string {
  const params = new URLSearchParams();
  if (process.env.NCBI_API_KEY) params.set("api_key", process.env.NCBI_API_KEY);
  params.set("tool", process.env.NCBI_TOOL || "newskill");
  if (process.env.NCBI_EMAIL) params.set("email", process.env.NCBI_EMAIL);
  return params.toString();
}

async function ncbiFetch(url: string): Promise<string> {
  await throttle();
  try {
    const result = await safeFetchText(url, { timeoutMs: TIMEOUT_MS, headers: { Accept: "application/json" } });
    if (!result.response.ok) {
      if (result.response.status === 429) throw new ConnectorError("RATE_LIMITED", "PubMed rate limited this request", 5);
      throw new ConnectorError("PROVIDER_UNAVAILABLE", `PubMed HTTP ${result.response.status}`);
    }
    return result.text;
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    if (err instanceof UnsafeUrlError) throw new ConnectorError("UNSAFE_URL", err.message);
    throw new ConnectorError("FETCH_TIMEOUT", "PubMed request failed or timed out");
  }
}

interface EsearchResponse {
  esearchresult?: { idlist?: string[] };
}

interface EsummaryArticleId {
  idtype: string;
  value: string;
}

interface EsummaryDocSum {
  uid: string;
  title?: string;
  pubdate?: string;
  source?: string;
  authors?: { name: string }[];
  articleids?: EsummaryArticleId[];
}

interface EsummaryResponse {
  result?: Record<string, EsummaryDocSum> & { uids?: string[] };
}

/** Batched: one esearch call for ids, then one esummary call for all of them
 *  — never one HTTP request per article. */
async function searchAndSummarize(term: string, retmax: number): Promise<NormalizedArticle[]> {
  const searchUrl = `${ESEARCH}?db=pubmed&term=${encodeURIComponent(term)}&retmode=json&retmax=${retmax}&${ncbiParams()}`;
  const searchText = await ncbiFetch(searchUrl);
  let searchData: EsearchResponse;
  try {
    searchData = JSON.parse(searchText) as EsearchResponse;
  } catch {
    throw new ConnectorError("PROVIDER_UNAVAILABLE", "PubMed returned an unparseable response");
  }
  const ids = searchData.esearchresult?.idlist ?? [];
  if (ids.length === 0) throw new ConnectorError("NO_RESULTS", "PubMed returned no results for this query");

  const summaryUrl = `${ESUMMARY}?db=pubmed&id=${ids.join(",")}&retmode=json&${ncbiParams()}`;
  const summaryText = await ncbiFetch(summaryUrl);
  let summaryData: EsummaryResponse;
  try {
    summaryData = JSON.parse(summaryText) as EsummaryResponse;
  } catch {
    throw new ConnectorError("PROVIDER_UNAVAILABLE", "PubMed returned an unparseable response");
  }

  return ids
    .map((id) => summaryData.result?.[id])
    .filter((doc): doc is EsummaryDocSum => Boolean(doc))
    .map((doc) => {
      const doi = doc.articleids?.find((a) => a.idtype === "doi")?.value ?? null;
      return {
        id: `pubmed:${doc.uid}`,
        title: doc.title || "(untitled)",
        summary: null,
        canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${doc.uid}/`,
        source: doc.source || "PubMed",
        authors: (doc.authors ?? []).map((a) => a.name),
        publishedAt: doc.pubdate ? safeDate(doc.pubdate) : null,
        thumbnail: null,
        doi,
        pmid: doc.uid,
        language: null,
        accessType: "unknown" as const,
        peerReviewed: true,
        preprint: false,
      };
    });
}

function safeDate(pubdate: string): string | null {
  const d = new Date(pubdate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function buildPubMedCandidate(input: { query: string; name?: string }): SourceCandidate {
  return {
    provider: "pubmed",
    connectorType: "api",
    name: input.name || `PubMed: ${input.query}`,
    homepage: "https://pubmed.ncbi.nlm.nih.gov",
    connectorConfig: { term: input.query },
    accessType: "unknown",
    contentType: "journal",
  };
}

export async function previewPubMed(query: string): Promise<NormalizedArticle[]> {
  return searchAndSummarize(query, 10);
}

export async function fetchPubMedArticles(query: string): Promise<NormalizedArticle[]> {
  return searchAndSummarize(query, PAGE_SIZE);
}
