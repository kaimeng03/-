import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/userSources", () => ({ getUserSourcesConfig: vi.fn() }));
vi.mock("@/lib/feeds", () => ({ fetchAllArticles: vi.fn() }));

import { auth } from "@/auth";
import { getUserSourcesConfig } from "@/lib/db/userSources";
import { fetchAllArticles } from "@/lib/feeds";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedGetUserSourcesConfig = vi.mocked(getUserSourcesConfig);
const mockedFetchAllArticles = vi.mocked(fetchAllArticles);

function request(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

function session(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as Session;
}

beforeEach(() => {
  mockedAuth.mockReset();
  mockedGetUserSourcesConfig.mockReset();
  mockedFetchAllArticles.mockReset();
});

describe("GET /api/articles", () => {
  it("loads sources from the authenticated user only", async () => {
    const sources = [
      { id: "source-1", name: "Example", homepage: "https://example.com", feedUrl: "https://example.com/feed", categoryId: "cat-1" },
    ];
    mockedAuth.mockResolvedValue(session("user-42") as never);
    mockedGetUserSourcesConfig.mockResolvedValue({ categories: [], sources });
    mockedFetchAllArticles.mockResolvedValue({ articles: [], failedSourceNames: [] });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mockedGetUserSourcesConfig).toHaveBeenCalledWith("user-42");
    expect(mockedFetchAllArticles).toHaveBeenCalledWith(sources);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not call external feeds when the user follows no sources", async () => {
    mockedAuth.mockResolvedValue(session() as never);
    mockedGetUserSourcesConfig.mockResolvedValue({ categories: [], sources: [] });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mockedFetchAllArticles).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ articles: [], failedSourceNames: [] });
  });

  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mockedGetUserSourcesConfig).not.toHaveBeenCalled();
  });
});
