import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { translateMany } from "./translate";

describe("translateMany fallback logging", () => {
  const originalAzureKey = process.env.AZURE_TRANSLATOR_KEY;

  beforeEach(() => {
    delete process.env.AZURE_TRANSLATOR_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalAzureKey === undefined) {
      delete process.env.AZURE_TRANSLATOR_KEY;
    } else {
      process.env.AZURE_TRANSLATOR_KEY = originalAzureKey;
    }
  });

  it("shows original text without emitting console.error when MyMemory rate-limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(translateMany(["First title", "Second title"])).resolves.toEqual([
      "First title",
      "Second title",
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("Translate HTTP 429"));
  });

  it("bounds public fallback requests for large feed batches", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responseStatus: 200, responseData: { translatedText: "翻譯" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateMany(["one", "two", "three", "four"], "zh-TW", { maxFallbackItems: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(["翻譯", "翻譯", "three", "four"]);
  });
});
