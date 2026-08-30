import { describe, it, expect } from "vitest";
import { stripTrackingParams } from "./trackingParams";

describe("stripTrackingParams", () => {
  it("removes utm_* and known ad-click params", () => {
    const input = "https://example.com/blog?utm_source=x&utm_medium=y&gclid=abc&fbclid=def";
    expect(stripTrackingParams(input)).toBe("https://example.com/blog");
  });

  it("removes gad_source, gad_campaignid, gbraid, wbraid", () => {
    const input = "https://example.com/?gad_source=1&gad_campaignid=2&gbraid=3&wbraid=4";
    expect(stripTrackingParams(input)).toBe("https://example.com/");
  });

  it("keeps query params the site actually needs", () => {
    const input = "https://example.com/search?q=architecture&page=2&utm_source=newsletter";
    const result = stripTrackingParams(input);
    expect(result).toContain("q=architecture");
    expect(result).toContain("page=2");
    expect(result).not.toContain("utm_source");
  });

  it("returns the input unchanged if it has no tracking params", () => {
    const input = "https://example.com/blog/";
    expect(stripTrackingParams(input)).toBe(input);
  });

  it("returns the raw input unchanged if it isn't a parseable URL", () => {
    expect(stripTrackingParams("not a url")).toBe("not a url");
  });
});
