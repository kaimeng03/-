import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { NotFoundError } from "@/lib/sourceStore";
import { removeUserSource } from "@/lib/db/userSources";

vi.mock("@/lib/db/userSources", () => ({ removeUserSource: vi.fn() }));

import { DELETE } from "./route";
import { auth } from "@/auth";

const mockedAuth = vi.mocked(auth);

function fakeSession(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  } as Session;
}

function makeRequest(opts: { origin?: string | null } = {}): NextRequest {
  const origin = "origin" in opts ? opts.origin : "https://example.com";
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: { get: () => undefined },
    nextUrl: new URL("https://example.com/api/sources/some-id"),
  } as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "some-id" }) };

beforeEach(() => {
  vi.mocked(removeUserSource).mockReset();
  mockedAuth.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DELETE /api/sources/[id]", () => {
  it("rejects an untrusted origin with 403", async () => {
    const res = await DELETE(makeRequest({ origin: "https://evil.example.net" }), ctx);
    expect(res.status).toBe(403);
    expect(removeUserSource).not.toHaveBeenCalled();
  });

  it("returns 401 when not logged in", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(401);
    expect(removeUserSource).not.toHaveBeenCalled();
  });

  it("returns 404 when the source isn't subscribed by this user", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    vi.mocked(removeUserSource).mockRejectedValueOnce(new NotFoundError("找不到這個網站來源"));
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("succeeds and only removes the session user's own subscription", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-42") as never);
    vi.mocked(removeUserSource).mockResolvedValueOnce(undefined);
    const res = await DELETE(makeRequest(), ctx);
    expect(res.status).toBe(200);
    expect(removeUserSource).toHaveBeenCalledWith("user-42", "some-id");
  });
});
