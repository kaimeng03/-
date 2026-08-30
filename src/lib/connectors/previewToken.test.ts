import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { signPreviewToken, verifyPreviewToken } from "./previewToken";
import { ConnectorError } from "./errors";
import type { SourceCandidate } from "./types";

const candidate: SourceCandidate = {
  provider: "generic",
  connectorType: "rss",
  name: "Test Source",
  homepage: "https://example.com",
  feedUrl: "https://example.com/rss",
};

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-value";
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe("previewToken — signs and verifies a server-validated candidate", () => {
  it("round-trips a valid token back to the same candidate", () => {
    const token = signPreviewToken(candidate);
    const verified = verifyPreviewToken(token);
    expect(verified).toEqual(candidate);
  });

  it("rejects a missing token", () => {
    expect(() => verifyPreviewToken(null)).toThrow(ConnectorError);
    expect(() => verifyPreviewToken(undefined)).toThrow(ConnectorError);
    expect(() => verifyPreviewToken("")).toThrow(ConnectorError);
  });

  it("rejects a malformed token (no signature segment)", () => {
    expect(() => verifyPreviewToken("not-a-real-token")).toThrow(ConnectorError);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = signPreviewToken(candidate);
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...candidate, name: "Hijacked" })).toString("base64url");
    expect(() => verifyPreviewToken(`${tamperedPayload}.${signature}`)).toThrow(ConnectorError);
    void payload;
  });

  it("rejects an expired token", () => {
    const token = signPreviewToken(candidate);
    const [payloadB64, signatureB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    payload.expiresAt = Date.now() - 1000; // already expired

    // Re-sign the expired payload with the same secret so only expiry (not
    // the signature) is what causes rejection.
    const expiredToken = signExpiredForTest(payload);
    expect(() => verifyPreviewToken(expiredToken)).toThrow(ConnectorError);
    void signatureB64;
  });

  it("never embeds AUTH_SECRET in the token itself", () => {
    const token = signPreviewToken(candidate);
    expect(token).not.toContain("test-secret-value");
  });

  it("throws a clear server-config error (not an insecure fallback) when AUTH_SECRET is unset", () => {
    delete process.env.AUTH_SECRET;
    expect(() => signPreviewToken(candidate)).toThrow(/AUTH_SECRET/);
  });
});

// Re-implements just enough of the signing logic (same algorithm, same env
// secret) to produce a validly-signed-but-expired token for the expiry test,
// without exporting internal signing details from previewToken.ts.
function signExpiredForTest(payload: unknown): string {
  const secret = process.env.AUTH_SECRET!;
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}
