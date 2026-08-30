import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { NotFoundError, CategoryNotEmptyError } from "@/lib/sourceStore";
import { removeUserCategory } from "@/lib/db/userSources";

vi.mock("@/lib/db/userSources", () => ({ removeUserCategory: vi.fn() }));

import { DELETE } from "./route";
import { auth } from "@/auth";

const mockedAuth = vi.mocked(auth);

function fakeSession(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  } as Session;
}

function makeRequest(opts: { origin?: string | null; force?: boolean } = {}): NextRequest {
  const origin = "origin" in opts ? opts.origin : "https://example.com";
  const url = new URL(`https://example.com/api/categories/some-id${opts.force ? "?force=true" : ""}`);
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: { get: () => undefined },
    nextUrl: url,
  } as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "some-id" }) };

beforeEach(() => {
  vi.mocked(removeUserCategory).mockReset();
  mockedAuth.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DELETE /api/categories/[id]", () => {
  it("rejects an untrusted origin with 403 before touching the store", async () => {
    const res = await DELETE(makeRequest({ origin: "https://evil.example.net" }), ctx);
    expect(res.status).toBe(403);
    expect(removeUserCategory).not.toHaveBeenCalled();
  });

  it("returns 401 when not logged in (no session)", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(401);
    expect(removeUserCategory).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent (or not-owned) category when logged in", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    vi.mocked(removeUserCategory).mockRejectedValueOnce(new NotFoundError("找不到這個分類"));
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 409 with sourceCount for a non-empty category without force", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    vi.mocked(removeUserCategory).mockRejectedValueOnce(new CategoryNotEmptyError(3));
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.sourceCount).toBe(3);
  });

  it("succeeds and passes the session's userId + force=true through when the query param is set", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-42") as never);
    vi.mocked(removeUserCategory).mockResolvedValueOnce(undefined);
    const res = await DELETE(makeRequest({ force: true }), ctx);
    expect(res.status).toBe(200);
    expect(removeUserCategory).toHaveBeenCalledWith("user-42", "some-id", { force: true });
  });

  it("does not pass force=true when the query param is absent", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    vi.mocked(removeUserCategory).mockResolvedValueOnce(undefined);
    await DELETE(makeRequest(), ctx);
    expect(removeUserCategory).toHaveBeenCalledWith(expect.any(String), "some-id", { force: false });
  });
});
