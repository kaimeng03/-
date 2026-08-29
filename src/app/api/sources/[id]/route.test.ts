import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { removeSource, NotFoundError } from "@/lib/sourceStore";

vi.mock("@/lib/sourceStore", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sourceStore")>("@/lib/sourceStore");
  return { ...actual, removeSource: vi.fn() };
});

import { DELETE } from "./route";
import { createSessionCookieValue, ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";

function makeRequest(opts: { origin?: string | null; loggedIn?: boolean } = {}): NextRequest {
  const origin = "origin" in opts ? opts.origin : "https://example.com";
  const sessionValue = opts.loggedIn ? createSessionCookieValue() : undefined;
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: {
      get: (name: string) =>
        name === ADMIN_SESSION_COOKIE && sessionValue ? { value: sessionValue } : undefined,
    },
    nextUrl: new URL("https://example.com/api/sources/some-id"),
  } as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "some-id" }) };

beforeEach(() => {
  vi.mocked(removeSource).mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DELETE /api/sources/[id]", () => {
  it("rejects an untrusted origin with 403", async () => {
    const res = await DELETE(makeRequest({ origin: "https://evil.example.net" }), ctx);
    expect(res.status).toBe(403);
    expect(removeSource).not.toHaveBeenCalled();
  });

  it("returns 501 when admin auth isn't configured", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(501);
  });

  it("returns 401 when not logged in", async () => {
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(401);
    expect(removeSource).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent source when logged in", async () => {
    vi.mocked(removeSource).mockRejectedValueOnce(new NotFoundError("找不到這個網站來源"));
    const res = await DELETE(makeRequest({ loggedIn: true }), ctx);
    expect(res.status).toBe(404);
  });

  it("succeeds when logged in and the source exists", async () => {
    vi.mocked(removeSource).mockResolvedValueOnce(undefined);
    const res = await DELETE(makeRequest({ loggedIn: true }), ctx);
    expect(res.status).toBe(200);
    expect(removeSource).toHaveBeenCalledWith("some-id");
  });
});
