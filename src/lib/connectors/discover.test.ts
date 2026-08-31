import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns", () => ({ default: { promises: { lookup: vi.fn() } } }));
import dns from "node:dns";
const mockLookup = dns.promises.lookup as unknown as ReturnType<typeof vi.fn>;

const previewPubMedMock = vi.fn();
const previewEuropePmcMock = vi.fn();
const previewCrossrefByQueryMock = vi.fn();
const previewCrossrefByIssnMock = vi.fn();
vi.mock("./pubmed", async () => {
  const actual = await vi.importActual<typeof import("./pubmed")>("./pubmed");
  return { ...actual, previewPubMed: (...args: unknown[]) => previewPubMedMock(...args) };
});
vi.mock("./europepmc", async () => {
  const actual = await vi.importActual<typeof import("./europepmc")>("./europepmc");
  return { ...actual, previewEuropePmc: (...args: unknown[]) => previewEuropePmcMock(...args) };
});
vi.mock("./crossref", async () => {
  const actual = await vi.importActual<typeof import("./crossref")>("./crossref");
  return {
    ...actual,
    previewCrossrefByQuery: (...args: unknown[]) => previewCrossrefByQueryMock(...args),
    previewCrossrefByIssn: (...args: unknown[]) => previewCrossrefByIssnMock(...args),
  };
});

import { discoverSource, classifyInput } from "./discover";
import { ConnectorError } from "./errors";

const SAMPLE_ARTICLE = {
  id: "x:1",
  title: "Sample",
  summary: null,
  canonicalUrl: "https://example.com/1",
  source: "Sample Journal",
  authors: [],
  publishedAt: null,
  thumbnail: null,
  doi: null,
  pmid: null,
  language: null,
  accessType: "unknown" as const,
  peerReviewed: null,
  preprint: null,
};

function response(status: number, headers: Record<string, string> = {}, body = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: null,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  vi.unstubAllGlobals();
  previewPubMedMock.mockReset().mockResolvedValue([SAMPLE_ARTICLE]);
  previewEuropePmcMock.mockReset().mockResolvedValue([SAMPLE_ARTICLE]);
  previewCrossrefByQueryMock.mockReset().mockResolvedValue([SAMPLE_ARTICLE]);
  previewCrossrefByIssnMock.mockReset().mockResolvedValue([SAMPLE_ARTICLE]);
});

describe("discoverSource — public article listings are checked before guessed feed paths", () => {
  it("creates a generic HTML preview without probing a long list of /feed URLs", async () => {
    const calls: string[] = [];
    const html = `<html><head><title>Public News</title></head><body><main>
      <article><a href="/articles/first-public-story"><h2>First public news article title</h2></a></article>
      <article><a href="/articles/second-public-story"><h2>Second public news article title</h2></a></article>
    </main></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url.toString());
        return response(200, { "content-type": "text/html" }, html);
      }),
    );

    const result = await discoverSource("https://example.com/news");
    expect(result.candidate).toMatchObject({ provider: "generic_html", connectorType: "html_adapter" });
    expect(result.articles).toHaveLength(2);
    expect(calls.every((url) => url === "https://example.com/news")).toBe(true);
  });
});

describe("classifyInput", () => {
  it("classifies a URL as url even if it superficially looks like something else", () => {
    expect(classifyInput("https://example.com/10.1038")).toBe("url");
  });
  it("classifies a bare DOI", () => {
    expect(classifyInput("10.1038/nphys1170")).toBe("doi");
  });
  it("classifies a bare ISSN", () => {
    expect(classifyInput("0261-3050")).toBe("issn");
  });
  it("classifies a short phrase as a journal name", () => {
    expect(classifyInput("Nature Physics")).toBe("journal_name");
  });
});

describe("discoverSource — a blocked/rate-limited site gets a precise error, never a fake success", () => {
  it("reports RATE_LIMITED (not NO_FEED_FOUND) for a site returning HTTP 429, e.g. a bot-challenge page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(429, { "retry-after": "30" })));

    const err = await discoverSource("https://archademia.com/blog/").catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfter).toBe(30);
  });

  it("reports ACCESS_BLOCKED for a site returning HTTP 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(403)));

    const err = await discoverSource("https://example.com/blocked").catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("ACCESS_BLOCKED");
  });

  it("reports LOGIN_REQUIRED for a site returning HTTP 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(401)));

    const err = await discoverSource("https://example.com/private").catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("LOGIN_REQUIRED");
  });
});

describe("discoverSource — input validation", () => {
  it("rejects empty input", async () => {
    await expect(discoverSource("   ")).rejects.toMatchObject({ code: "INVALID_URL" });
  });

  it("rejects an unreasonably long input", async () => {
    await expect(discoverSource("x".repeat(501))).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});

describe("discoverSource — provider selection is a connector choice, not a medical tier", () => {
  it("provider=pubmed actually calls previewPubMed for a keyword", async () => {
    await discoverSource("diabetes treatment", "pubmed");
    expect(previewPubMedMock).toHaveBeenCalledWith("diabetes treatment");
    expect(previewEuropePmcMock).not.toHaveBeenCalled();
    expect(previewCrossrefByQueryMock).not.toHaveBeenCalled();
  });

  it("provider=europepmc calls previewEuropePmc for a keyword", async () => {
    await discoverSource("diabetes treatment", "europepmc");
    expect(previewEuropePmcMock).toHaveBeenCalledWith("diabetes treatment");
    expect(previewPubMedMock).not.toHaveBeenCalled();
  });

  it("provider=crossref calls previewCrossrefByQuery for a keyword", async () => {
    await discoverSource("sustainable architecture", "crossref");
    expect(previewCrossrefByQueryMock).toHaveBeenCalledWith("sustainable architecture");
    expect(previewPubMedMock).not.toHaveBeenCalled();
  });

  it("provider=auto falls back Crossref -> Europe PMC (documented, tested order)", async () => {
    await discoverSource("some keyword", "auto");
    expect(previewCrossrefByQueryMock).toHaveBeenCalled();
    expect(previewEuropePmcMock).not.toHaveBeenCalled();

    previewCrossrefByQueryMock.mockRejectedValueOnce(new ConnectorError("NO_RESULTS", "none"));
    await discoverSource("some other keyword", "auto");
    expect(previewEuropePmcMock).toHaveBeenCalled();
  });

  it("an ISSN with provider=pubmed uses PubMed instead of the Crossref default", async () => {
    await discoverSource("0261-3050", "pubmed");
    expect(previewPubMedMock).toHaveBeenCalledWith("0261-3050");
    expect(previewCrossrefByIssnMock).not.toHaveBeenCalled();
  });

  it("a Crossref ISSN candidate stores connectorConfig as { issn }, not { query }", async () => {
    const result = await discoverSource("0261-3050", "auto");
    expect(result.candidate?.connectorConfig).toEqual({ issn: "0261-3050" });
  });

  it("a Crossref keyword candidate stores connectorConfig as { query }", async () => {
    const result = await discoverSource("sustainable architecture", "crossref");
    expect(result.candidate?.connectorConfig).toEqual({ query: "sustainable architecture" });
  });

  it("a PubMed candidate stores connectorConfig as { term }", async () => {
    const result = await discoverSource("diabetes treatment", "pubmed");
    expect(result.candidate?.connectorConfig).toEqual({ term: "diabetes treatment" });
  });

  it("a DOI always resolves via Crossref regardless of the provider param", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 }) as Response),
    );
    // lookupDoi isn't mocked here — it will fail against the (unreachable in
    // tests) network, but the important assertion is that PubMed/EuropePMC
    // are never even attempted for a DOI, regardless of `provider`.
    await discoverSource("10.1038/nphys1170", "pubmed").catch(() => {});
    expect(previewPubMedMock).not.toHaveBeenCalled();
  });
});
