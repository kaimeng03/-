import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/sourceStore", () => ({
  addCategory: vi.fn(async (name: string) => ({ id: name.toLowerCase(), name })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST } from "./route";
import { addCategory } from "@/lib/sourceStore";

function makeRequest(opts: { origin?: string | null; body?: unknown }): NextRequest {
  const origin = "origin" in opts ? opts.origin : "https://example.com";
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: { get: () => undefined },
    json: async () => opts.body ?? { name: "Interior Design" },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.mocked(addCategory).mockClear();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  vi.stubEnv("ADMIN_PASSWORD", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/categories — guards", () => {
  it("rejects a request with no Origin header (403), before ever checking auth", async () => {
    const res = await POST(makeRequest({ origin: null }));
    expect(res.status).toBe(403);
    expect(addCategory).not.toHaveBeenCalled();
  });

  it("rejects a cross-site Origin (403)", async () => {
    const res = await POST(makeRequest({ origin: "https://evil.example.net" }));
    expect(res.status).toBe(403);
    expect(addCategory).not.toHaveBeenCalled();
  });

  it("returns 501 when ADMIN_PASSWORD isn't configured, even with a trusted origin", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(501);
    expect(addCategory).not.toHaveBeenCalled();
  });

  it("returns 401 when ADMIN_PASSWORD is configured but the request isn't logged in", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(addCategory).not.toHaveBeenCalled();
  });
});
