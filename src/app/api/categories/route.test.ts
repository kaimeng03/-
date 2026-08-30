import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("@/lib/db/userSources", () => ({
  addUserCategory: vi.fn(async (userId: string, name: string) => ({ id: name.toLowerCase(), name })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { POST } from "./route";
import { addUserCategory } from "@/lib/db/userSources";
import { auth } from "@/auth";

const mockedAuth = vi.mocked(auth);

function fakeSession(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  } as Session;
}

function makeRequest(opts: { origin?: string | null; body?: unknown }): NextRequest {
  const origin = "origin" in opts ? opts.origin : "https://example.com";
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: { get: () => undefined },
    json: async () => opts.body ?? { name: "Interior Design" },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.mocked(addUserCategory).mockClear();
  mockedAuth.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/categories — guards", () => {
  it("rejects a request with no Origin header (403), before ever checking auth", async () => {
    const res = await POST(makeRequest({ origin: null }));
    expect(res.status).toBe(403);
    expect(addUserCategory).not.toHaveBeenCalled();
    expect(mockedAuth).not.toHaveBeenCalled();
  });

  it("rejects a cross-site Origin (403)", async () => {
    const res = await POST(makeRequest({ origin: "https://evil.example.net" }));
    expect(res.status).toBe(403);
    expect(addUserCategory).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(addUserCategory).not.toHaveBeenCalled();
  });

  it("creates the category scoped to the session's userId when authenticated", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-42") as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(addUserCategory).toHaveBeenCalledWith("user-42", "Interior Design");
  });
});
