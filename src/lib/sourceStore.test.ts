import { describe, it, expect, vi, beforeEach } from "vitest";

const store: { config: Record<string, unknown> } = {
  config: {
    categories: [
      { id: "architecture-news", name: "建築新聞" },
      { id: "empty-cat", name: "Empty Category" },
    ],
    sources: [
      {
        id: "archdaily",
        name: "ArchDaily",
        homepage: "https://www.archdaily.com",
        feedUrl: "https://www.archdaily.com/rss/",
        categoryId: "architecture-news",
      },
    ],
  },
};

vi.mock("fs", () => {
  const promises = {
    readFile: vi.fn(() => Promise.resolve(JSON.stringify(store.config))),
    writeFile: vi.fn((_path: string, data: string) => {
      store.config = JSON.parse(data);
      return Promise.resolve();
    }),
  };
  return { promises, default: { promises } };
});

const discoverFeedMock = vi.fn();
vi.mock("./feedDiscovery", () => ({ discoverFeed: (...args: unknown[]) => discoverFeedMock(...args) }));

// validateFeedUrl (called for the RSS path only) goes through safeFetch — mocking
// safeFetch itself lets us assert "no network validation happened" for the HTML
// adapter path without needing to intercept a same-module function call (spying on
// a module's own export doesn't affect the module's internal calls to itself under
// ESM semantics, so mocking one level down is the reliable option here).
const safeFetchMock = vi.fn();
vi.mock("./safeFetch", async () => {
  const actual = await vi.importActual<typeof import("./safeFetch")>("./safeFetch");
  return { ...actual, safeFetch: (...args: unknown[]) => safeFetchMock(...args) };
});

const twarchitectAdapterMock = vi.fn();
vi.mock("./adapters", async () => {
  const actual = await vi.importActual<typeof import("./adapters")>("./adapters");
  return {
    ...actual,
    getHtmlAdapter: (name: string | undefined) => (name === "twarchitect" ? twarchitectAdapterMock : null),
  };
});

import { removeCategory, removeSource, addSource, NotFoundError, CategoryNotEmptyError } from "./sourceStore";

beforeEach(() => {
  discoverFeedMock.mockReset();
  safeFetchMock.mockReset();
  twarchitectAdapterMock.mockReset();
});

beforeEach(() => {
  // GITHUB_TOKEN must stay unset so sourceStore falls back to the mocked local fs path.
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO;
  store.config = {
    categories: [
      { id: "architecture-news", name: "建築新聞" },
      { id: "empty-cat", name: "Empty Category" },
    ],
    sources: [
      {
        id: "archdaily",
        name: "ArchDaily",
        homepage: "https://www.archdaily.com",
        feedUrl: "https://www.archdaily.com/rss/",
        categoryId: "architecture-news",
      },
    ],
  };
});

describe("removeCategory", () => {
  it("deletes an empty category without needing force", async () => {
    await removeCategory("empty-cat");
    const categories = (store.config as { categories: { id: string }[] }).categories;
    expect(categories.some((c) => c.id === "empty-cat")).toBe(false);
  });

  it("refuses to delete a non-empty category without force, and does not touch its sources", async () => {
    await expect(removeCategory("architecture-news")).rejects.toBeInstanceOf(CategoryNotEmptyError);
    const config = store.config as { categories: { id: string }[]; sources: { id: string }[] };
    expect(config.categories.some((c) => c.id === "architecture-news")).toBe(true);
    expect(config.sources.some((s) => s.id === "archdaily")).toBe(true);
  });

  it("reports how many sources are blocking deletion", async () => {
    try {
      await removeCategory("architecture-news");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CategoryNotEmptyError);
      expect((err as CategoryNotEmptyError).sourceCount).toBe(1);
    }
  });

  it("deletes a non-empty category and its sources when force is true", async () => {
    await removeCategory("architecture-news", { force: true });
    const config = store.config as { categories: { id: string }[]; sources: { id: string }[] };
    expect(config.categories.some((c) => c.id === "architecture-news")).toBe(false);
    expect(config.sources.some((s) => s.id === "archdaily")).toBe(false);
  });

  it("throws NotFoundError for a nonexistent category id", async () => {
    await expect(removeCategory("does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removeSource", () => {
  it("removes a source without touching its category", async () => {
    await removeSource("archdaily");
    const config = store.config as { categories: { id: string }[]; sources: { id: string }[] };
    expect(config.sources.some((s) => s.id === "archdaily")).toBe(false);
    expect(config.categories.some((c) => c.id === "architecture-news")).toBe(true);
  });

  it("throws NotFoundError for a nonexistent source id", async () => {
    await expect(removeSource("does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("addSource — HTML adapter routing", () => {
  const TWARCHITECT_INPUT = "https://www.twarchitect.org.tw/page_news/";

  it("recognizes a twarchitect URL and skips discoverFeed/validateFeedUrl (RSS validator) entirely", async () => {
    twarchitectAdapterMock.mockResolvedValue([
      { id: "a1", link: "x#a1", title: "News 1", pubDate: null, summary: "s", thumbnail: null, htmlEn: "<p>s</p>" },
    ]);

    const source = await addSource({
      name: "建築師雜誌",
      feedUrl: TWARCHITECT_INPUT,
      categoryId: "architecture-news",
    });

    expect(discoverFeedMock).not.toHaveBeenCalled();
    expect(safeFetchMock).not.toHaveBeenCalled(); // proves validateFeedUrl's own fetch never ran either
    expect(twarchitectAdapterMock).toHaveBeenCalledWith("https://www.twarchitect.org.tw/page_news/");
    expect(source.type).toBe("html");
    expect(source.adapter).toBe("twarchitect");
    expect(source.pageUrl).toBe("https://www.twarchitect.org.tw/page_news/");
  });

  it("rejects adding it when the adapter finds zero articles (never fabricates a working source)", async () => {
    twarchitectAdapterMock.mockResolvedValue([]);
    await expect(
      addSource({ name: "建築師雜誌", feedUrl: TWARCHITECT_INPUT, categoryId: "architecture-news" }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate twarchitect source with a clear 'already following' message", async () => {
    twarchitectAdapterMock.mockResolvedValue([
      { id: "a1", link: "x#a1", title: "News 1", pubDate: null, summary: "s", thumbnail: null, htmlEn: "<p>s</p>" },
    ]);
    await addSource({ name: "建築師雜誌", feedUrl: TWARCHITECT_INPUT, categoryId: "architecture-news" });

    await expect(
      addSource({
        name: "建築師雜誌 again",
        feedUrl: "https://twarchitect.org.tw/page_news", // different casing/form, same canonical page
        categoryId: "architecture-news",
      }),
    ).rejects.toThrow(/已經關注/);
  });

  it("still uses discoverFeed/validateFeedUrl for an ordinary RSS URL", async () => {
    discoverFeedMock.mockResolvedValue({ ok: true, feedUrl: "https://example.com/rss.xml" });
    safeFetchMock.mockResolvedValue({
      response: { ok: true, headers: new Headers(), status: 200 },
      finalUrl: "https://example.com/rss.xml",
    });
    // A minimal valid RSS document so rss-parser succeeds.
    const rssXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>
      <item><title>Item</title><link>https://example.com/1</link></item>
      </channel></rss>`;
    safeFetchMock.mockResolvedValue({
      response: {
        ok: true,
        headers: new Headers(),
        status: 200,
        body: undefined,
        arrayBuffer: async () => new TextEncoder().encode(rssXml).buffer,
      },
      finalUrl: "https://example.com/rss.xml",
    });

    await addSource({ name: "Example", feedUrl: "https://example.com/", categoryId: "architecture-news" });

    expect(discoverFeedMock).toHaveBeenCalled();
    expect(safeFetchMock).toHaveBeenCalled();
    expect(twarchitectAdapterMock).not.toHaveBeenCalled();
  });
});
