import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("production security headers", () => {
  it("disables the framework disclosure header and applies browser defenses", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers!();
    const allPaths = rules.find((rule) => rule.source === "/:path*");
    const headers = new Map(allPaths?.headers.map((header) => [header.key.toLowerCase(), header.value]));

    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });
});
