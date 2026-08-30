import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchTextMock = vi.fn();
vi.mock("@/lib/safeFetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/safeFetch")>("@/lib/safeFetch");
  return { ...actual, safeFetchText: (...args: unknown[]) => safeFetchTextMock(...args) };
});

import { previewPubMed, fetchPubMedArticles } from "./pubmed";
import { ConnectorError } from "./errors";

function jsonResponse(body: unknown, status = 200) {
  return { response: { ok: status >= 200 && status < 300, status } as Response, text: JSON.stringify(body), finalUrl: "x" };
}

beforeEach(() => {
  safeFetchTextMock.mockReset();
});

describe("PubMed connector — batched esearch + esummary, never one request per article", () => {
  it("fetches ids via esearch then a single batched esummary call", async () => {
    safeFetchTextMock
      .mockResolvedValueOnce(jsonResponse({ esearchresult: { idlist: ["1", "2", "3"] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            uids: ["1", "2", "3"],
            "1": { uid: "1", title: "First", pubdate: "2024 Jan", authors: [{ name: "A B" }], articleids: [{ idtype: "doi", value: "10.1/x" }] },
            "2": { uid: "2", title: "Second", pubdate: "2024 Feb" },
            "3": { uid: "3", title: "Third", pubdate: "2024 Mar" },
          },
        }),
      );

    const articles = await previewPubMed("diabetes");
    expect(articles).toHaveLength(3);
    expect(articles[0]).toMatchObject({ title: "First", doi: "10.1/x", pmid: "1" });
    // Exactly 2 HTTP calls total for 3 articles — batched, not per-article.
    expect(safeFetchTextMock).toHaveBeenCalledTimes(2);
  });

  it("throws NO_RESULTS when esearch finds nothing", async () => {
    safeFetchTextMock.mockResolvedValueOnce(jsonResponse({ esearchresult: { idlist: [] } }));

    await expect(previewPubMed("zzzznonexistent")).rejects.toMatchObject({ code: "NO_RESULTS" });
  });

  it("maps HTTP 429 to RATE_LIMITED", async () => {
    safeFetchTextMock.mockResolvedValueOnce({ response: { ok: false, status: 429 } as Response, text: "", finalUrl: "x" });

    const err = await fetchPubMedArticles("diabetes").catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("supports NCBI_API_KEY / NCBI_TOOL / NCBI_EMAIL being appended server-side", async () => {
    vi.stubEnv("NCBI_API_KEY", "test-key");
    vi.stubEnv("NCBI_TOOL", "newskill-test");
    vi.stubEnv("NCBI_EMAIL", "test@example.com");

    safeFetchTextMock
      .mockResolvedValueOnce(jsonResponse({ esearchresult: { idlist: ["1"] } }))
      .mockResolvedValueOnce(jsonResponse({ result: { uids: ["1"], "1": { uid: "1", title: "X" } } }));

    await previewPubMed("x");
    const firstCallUrl = safeFetchTextMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("api_key=test-key");
    expect(firstCallUrl).toContain("tool=newskill-test");
    expect(firstCallUrl).toContain("email=test%40example.com");
    vi.unstubAllEnvs();
  });
});
