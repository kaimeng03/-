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

import { removeCategory, removeSource, NotFoundError, CategoryNotEmptyError } from "./sourceStore";

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
