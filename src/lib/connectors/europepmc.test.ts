import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchTextMock = vi.fn();
vi.mock("@/lib/safeFetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/safeFetch")>("@/lib/safeFetch");
  return { ...actual, safeFetchText: (...args: unknown[]) => safeFetchTextMock(...args) };
});

import { previewEuropePmc, fetchEuropePmcArticles } from "./europepmc";
import { ConnectorError } from "./errors";

function jsonResponse(body: unknown, status = 200) {
  return { response: { ok: status >= 200 && status < 300, status } as Response, text: JSON.stringify(body), finalUrl: "x" };
}

beforeEach(() => {
  safeFetchTextMock.mockReset();
});

describe("Europe PMC connector", () => {
  it("normalizes a normal successful result", async () => {
    safeFetchTextMock.mockResolvedValue(
      jsonResponse({
        hitCount: 1,
        resultList: {
          result: [
            {
              id: "123",
              pmid: "123",
              doi: "10.1/abc",
              title: "A Study",
              authorString: "Smith J, Doe A.",
              journalTitle: "Journal X",
              isOpenAccess: "Y",
              firstPublicationDate: "2024-01-01",
            },
          ],
        },
      }),
    );

    const articles = await previewEuropePmc("cancer");
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      title: "A Study",
      doi: "10.1/abc",
      pmid: "123",
      accessType: "open_access",
      peerReviewed: true,
    });
  });

  it("throws NO_RESULTS when the query matches nothing", async () => {
    safeFetchTextMock.mockResolvedValue(jsonResponse({ hitCount: 0, resultList: { result: [] } }));

    await expect(previewEuropePmc("zzzzznonexistentzzzz")).rejects.toMatchObject({ code: "NO_RESULTS" });
  });

  it("maps HTTP 429 to a RATE_LIMITED ConnectorError with retryAfter, not a thrown network error", async () => {
    safeFetchTextMock.mockResolvedValue({ response: { ok: false, status: 429 } as Response, text: "", finalUrl: "x" });

    const err = await fetchEuropePmcArticles("cancer").catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfter).toBeGreaterThan(0);
  });

  it("maps a non-429 error status to PROVIDER_UNAVAILABLE", async () => {
    safeFetchTextMock.mockResolvedValue({ response: { ok: false, status: 500 } as Response, text: "", finalUrl: "x" });

    await expect(fetchEuropePmcArticles("cancer")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
