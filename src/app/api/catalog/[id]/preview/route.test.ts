import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/userSources", () => ({ getCuratedSourceForPreview: vi.fn() }));
vi.mock("@/lib/feeds", () => ({ fetchSourcePreview: vi.fn() }));

import { auth } from "@/auth";
import { getCuratedSourceForPreview } from "@/lib/db/userSources";
import { fetchSourcePreview } from "@/lib/feeds";
import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "source-1" }) };
const req = { headers: { get: () => null } } as unknown as NextRequest;
const source = {
  id: "source-1",
  name: "Trusted News",
  homepage: "https://news.example.com",
  feedUrl: "https://news.example.com/rss",
  categoryId: "catalog-preview",
};

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(getCuratedSourceForPreview).mockReset();
  vi.mocked(fetchSourcePreview).mockReset();
});

describe("GET /api/catalog/[id]/preview", () => {
  it("requires login", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await GET(req, ctx)).status).toBe(401);
  });

  it("returns 404 when the source is not curated and active", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getCuratedSourceForPreview).mockResolvedValue(null);
    expect((await GET(req, ctx)).status).toBe(404);
    expect(fetchSourcePreview).not.toHaveBeenCalled();
  });

  it("returns a five-article read-only preview without following", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getCuratedSourceForPreview).mockResolvedValue(source);
    vi.mocked(fetchSourcePreview).mockResolvedValue([{ id: "a1", title: "Preview title", summary: "Summary", canonicalUrl: "https://news.example.com/a1", publishedAt: null, thumbnail: null }]);

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: { id: "source-1" }, articles: [{ title: "Preview title" }] });
    expect(fetchSourcePreview).toHaveBeenCalledWith(source, 5);
  });
});
