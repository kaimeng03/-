import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchTextMock = vi.fn();
vi.mock("@/lib/safeFetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/safeFetch")>("@/lib/safeFetch");
  return { ...actual, safeFetchText: (...args: unknown[]) => safeFetchTextMock(...args) };
});

import { lookupDoi, previewCrossrefByIssn, previewCrossrefByQuery, looksLikeDoi, looksLikeIssn } from "./crossref";
import { ConnectorError } from "./errors";

function jsonResponse(body: unknown, status = 200) {
  return { response: { ok: status >= 200 && status < 300, status } as Response, text: JSON.stringify(body), finalUrl: "x" };
}

beforeEach(() => {
  safeFetchTextMock.mockReset();
});

describe("looksLikeDoi / looksLikeIssn", () => {
  it("recognizes a DOI", () => {
    expect(looksLikeDoi("10.1038/nphys1170")).toBe(true);
    expect(looksLikeDoi("not a doi")).toBe(false);
  });

  it("recognizes an ISSN", () => {
    expect(looksLikeIssn("0261-3050")).toBe(true);
    expect(looksLikeIssn("0028-0836")).toBe(true);
    expect(looksLikeIssn("not-an-issn")).toBe(false);
  });
});

describe("Crossref connector — cross-domain, not health-specific", () => {
  it("looks up a work directly by DOI", async () => {
    safeFetchTextMock.mockResolvedValue(
      jsonResponse({
        status: "ok",
        message: { DOI: "10.1038/nphys1170", title: ["A Paper"], "container-title": ["Nature Physics"], URL: "https://doi.org/10.1038/nphys1170" },
      }),
    );

    const article = await lookupDoi("10.1038/nphys1170");
    expect(article).toMatchObject({ doi: "10.1038/nphys1170", title: "A Paper", source: "Nature Physics" });
  });

  it("searches by ISSN filter", async () => {
    safeFetchTextMock.mockResolvedValue(
      jsonResponse({ status: "ok", message: { items: [{ DOI: "10.1/a", title: ["T"] }] } }),
    );

    const articles = await previewCrossrefByIssn("0261-3050");
    expect(articles).toHaveLength(1);
    const url = safeFetchTextMock.mock.calls[0][0] as string;
    expect(url).toContain("filter=issn:0261-3050");
  });

  it("throws NO_RESULTS for an empty result list", async () => {
    safeFetchTextMock.mockResolvedValue(jsonResponse({ status: "ok", message: { items: [] } }));

    await expect(previewCrossrefByQuery("zzzznonexistent")).rejects.toMatchObject({ code: "NO_RESULTS" });
  });

  it("maps HTTP 429 to RATE_LIMITED", async () => {
    safeFetchTextMock.mockResolvedValue({ response: { ok: false, status: 429 } as Response, text: "", finalUrl: "x" });

    const err = await previewCrossrefByQuery("x").catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("is usable for non-health domains too (architecture/education/law/etc)", async () => {
    safeFetchTextMock.mockResolvedValue(
      jsonResponse({ status: "ok", message: { items: [{ DOI: "10.1/arch", title: ["Building Design Journal Article"] }] } }),
    );
    const articles = await previewCrossrefByQuery("sustainable architecture");
    expect(articles[0].title).toContain("Building Design");
  });
});
