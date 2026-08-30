import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const searchCatalogMock = vi.fn();
vi.mock("@/lib/db/userSources", () => ({ searchCatalog: (...args: unknown[]) => searchCatalogMock(...args) }));

import { GET } from "./route";
import { auth } from "@/auth";

const mockedAuth = vi.mocked(auth);

function fakeSession(): Session {
  return {
    user: { id: "user-1", professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  } as Session;
}

function makeRequest(query: string): NextRequest {
  return { nextUrl: new URL(`https://example.com/api/catalog/search${query}`) } as unknown as NextRequest;
}

beforeEach(() => {
  searchCatalogMock.mockReset().mockResolvedValue([]);
  mockedAuth.mockReset();
});

describe("GET /api/catalog/search", () => {
  it("returns 401 without a session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(makeRequest("?query=test"));
    expect(res.status).toBe(401);
  });

  it("basic search succeeds and passes the query through", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    const res = await GET(makeRequest("?query=architecture"));
    expect(res.status).toBe(200);
    expect(searchCatalogMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ query: "architecture" }));
  });

  it("an illegal contentType/accessType value is dropped, not forwarded as an arbitrary filter", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    await GET(makeRequest("?contentType=<script>&accessType=totally-not-real"));
    expect(searchCatalogMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ contentType: undefined, accessType: undefined }),
    );
  });

  it("an unknown profession key is dropped, not forwarded", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    await GET(makeRequest("?profession=not-a-real-profession"));
    expect(searchCatalogMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ professionKey: undefined }));
  });

  it("a valid allowlisted contentType passes through", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    await GET(makeRequest("?contentType=journal&accessType=open_access"));
    expect(searchCatalogMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ contentType: "journal", accessType: "open_access" }),
    );
  });
});
