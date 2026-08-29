import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { removeCategory, NotFoundError, CategoryNotEmptyError } from "@/lib/sourceStore";

vi.mock("@/lib/sourceStore", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sourceStore")>("@/lib/sourceStore");
  return { ...actual, removeCategory: vi.fn() };
});

import { DELETE } from "./route";
import { createSessionCookieValue, ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";

function makeRequest(
  opts: { origin?: string | null; force?: boolean; loggedIn?: boolean } = {},
): NextRequest {
  const origin = "origin" in opts ? opts.origin : "https://example.com";
  const url = new URL(`https://example.com/api/categories/some-id${opts.force ? "?force=true" : ""}`);
  const sessionValue = opts.loggedIn ? createSessionCookieValue() : undefined;
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: {
      get: (name: string) =>
        name === ADMIN_SESSION_COOKIE && sessionValue ? { value: sessionValue } : undefined,
    },
    nextUrl: url,
  } as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "some-id" }) };

beforeEach(() => {
  vi.mocked(removeCategory).mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DELETE /api/categories/[id]", () => {
  it("rejects an untrusted origin with 403 before touching the store", async () => {
    const res = await DELETE(makeRequest({ origin: "https://evil.example.net" }), ctx);
    expect(res.status).toBe(403);
    expect(removeCategory).not.toHaveBeenCalled();
  });

  it("returns 501 when admin auth isn't configured", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(501);
    expect(removeCategory).not.toHaveBeenCalled();
  });

  it("returns 401 when not logged in (no session cookie)", async () => {
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(401);
    expect(removeCategory).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent category when logged in", async () => {
    vi.mocked(removeCategory).mockRejectedValueOnce(new NotFoundError("找不到這個分類"));
    const res = await DELETE(makeRequest({ loggedIn: true }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 409 with sourceCount for a non-empty category without force", async () => {
    vi.mocked(removeCategory).mockRejectedValueOnce(new CategoryNotEmptyError(3));
    const res = await DELETE(makeRequest({ loggedIn: true }), ctx);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.sourceCount).toBe(3);
  });

  it("succeeds and passes force=true through when the query param is set", async () => {
    vi.mocked(removeCategory).mockResolvedValueOnce(undefined);
    const res = await DELETE(makeRequest({ loggedIn: true, force: true }), ctx);
    expect(res.status).toBe(200);
    expect(removeCategory).toHaveBeenCalledWith("some-id", { force: true });
  });

  it("does not pass force=true when the query param is absent", async () => {
    vi.mocked(removeCategory).mockResolvedValueOnce(undefined);
    await DELETE(makeRequest({ loggedIn: true }), ctx);
    expect(removeCategory).toHaveBeenCalledWith("some-id", { force: false });
  });
});
