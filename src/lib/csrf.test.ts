import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { checkTrustedOrigin } from "./csrf";

function makeRequest(originHeader: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name === "origin" ? originHeader : null) },
  } as unknown as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkTrustedOrigin", () => {
  it("rejects a request with no Origin header", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const result = checkTrustedOrigin(makeRequest(null));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing-origin");
  });

  it("accepts an Origin matching NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const result = checkTrustedOrigin(makeRequest("https://example.com"));
    expect(result.ok).toBe(true);
  });

  it("rejects a mismatched cross-site Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const result = checkTrustedOrigin(makeRequest("https://evil.example.net"));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("untrusted-origin");
  });

  it("accepts an Origin matching VERCEL_PROJECT_PRODUCTION_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "my-app.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const result = checkTrustedOrigin(makeRequest("https://my-app.vercel.app"));
    expect(result.ok).toBe(true);
  });

  it("accepts http://localhost:3000 outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const result = checkTrustedOrigin(makeRequest("http://localhost:3000"));
    expect(result.ok).toBe(true);
  });

  it("fails closed when nothing is configured in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const result = checkTrustedOrigin(makeRequest("https://example.com"));
    expect(result.ok).toBe(false);
  });

  it("does not trust an arbitrary Origin just because it looks like our Host header would", () => {
    // Simulates an attacker-controlled page whose own origin happens to be
    // attacker.com, sending a cross-site request — Host/X-Forwarded-Host are
    // irrelevant here since checkTrustedOrigin never reads them.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const result = checkTrustedOrigin(makeRequest("https://attacker.com"));
    expect(result.ok).toBe(false);
  });
});
