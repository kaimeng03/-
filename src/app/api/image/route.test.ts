import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const safeFetchMock = vi.fn();
vi.mock("@/lib/safeFetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/safeFetch")>("@/lib/safeFetch");
  return { ...actual, safeFetch: (...args: unknown[]) => safeFetchMock(...args) };
});

import { auth } from "@/auth";
import { UnsafeUrlError } from "@/lib/safeFetch";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);

function fakeSession(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as Session;
}

function makeRequest(url = "https://images.example.com/photo.jpg"): NextRequest {
  return {
    nextUrl: new URL(`https://example.com/api/image?url=${encodeURIComponent(url)}`),
    headers: { get: () => null },
  } as unknown as NextRequest;
}

function upstream(contentType: string, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": contentType, ...headers },
  });
}

beforeEach(() => {
  safeFetchMock.mockReset();
  mockedAuth.mockReset().mockResolvedValue(fakeSession() as never);
});

describe("GET /api/image — authenticated raster proxy", () => {
  it("returns 401 before fetching for an unauthenticated request", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("keeps the existing SSRF rejection behavior", async () => {
    safeFetchMock.mockRejectedValue(new UnsafeUrlError("blocked"));
    const res = await GET(makeRequest("http://127.0.0.1/secret"));
    expect(res.status).toBe(400);
  });

  it("rejects SVG active content", async () => {
    safeFetchMock.mockResolvedValue({ response: upstream("image/svg+xml"), finalUrl: "https://images.example.com/x.svg" });
    const res = await GET(makeRequest("https://images.example.com/x.svg"));
    expect(res.status).toBe(415);
  });

  it("rejects an image whose declared size exceeds the cap", async () => {
    safeFetchMock.mockResolvedValue({
      response: upstream("image/png", { "Content-Length": String(20 * 1024 * 1024 + 1) }),
      finalUrl: "https://images.example.com/x.png",
    });
    const res = await GET(makeRequest("https://images.example.com/x.png"));
    expect(res.status).toBe(413);
  });

  it("serves raster images with private caching and nosniff", async () => {
    safeFetchMock.mockResolvedValue({ response: upstream("image/png"), finalUrl: "https://images.example.com/x.png" });
    const res = await GET(makeRequest("https://images.example.com/x.png"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("vary")).toBe("Cookie");
  });
});
