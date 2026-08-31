import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { POST } from "./route";
import { auth } from "@/auth";

const mockedAuth = vi.mocked(auth);

function makeRequest(headers: Record<string, string> = {}, includeOrigin = true): NextRequest {
  const normalized = includeOrigin ? { origin: "https://example.com", ...headers } : headers;
  return {
    headers: { get: (name: string) => normalized[name.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockedAuth.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/refresh — not anonymously triggerable", () => {
  it("returns 401 with no session and no CRON_SECRET configured", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("succeeds for a logged-in session", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it("rejects a cross-site manual refresh even for a logged-in session", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(makeRequest({ origin: "https://evil.example.net" }));
    expect(res.status).toBe(403);
  });

  it("succeeds with a correct CRON_SECRET bearer token, without any session", async () => {
    vi.stubEnv("CRON_SECRET", "shh-its-a-secret");
    mockedAuth.mockResolvedValue(null as never);

    const res = await POST(makeRequest({ authorization: "Bearer shh-its-a-secret" }, false));
    expect(res.status).toBe(200);
    expect(mockedAuth).not.toHaveBeenCalled();
  });

  it("rejects a wrong CRON_SECRET and falls back to requiring a session", async () => {
    vi.stubEnv("CRON_SECRET", "shh-its-a-secret");
    mockedAuth.mockResolvedValue(null as never);

    const res = await POST(makeRequest({ authorization: "Bearer wrong-value" }));
    expect(res.status).toBe(401);
  });
});
