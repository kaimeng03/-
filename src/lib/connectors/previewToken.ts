import crypto from "crypto";
import { ConnectorError } from "./errors";
import type { SourceCandidate } from "./types";

// Short-lived, HMAC-signed token binding a server-validated discovery candidate
// to the confirm step, so /api/source-discovery/confirm never has to trust a
// candidate object built by the browser (which could otherwise skip preview
// entirely and forge one) and never has to re-call the external provider.
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PreviewTokenPayload {
  candidate: SourceCandidate;
  issuedAt: number;
  expiresAt: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // A real server configuration error, not a user-facing "expected" outcome
    // — logged, but the message never includes the secret itself (there isn't one).
    throw new Error("AUTH_SECRET is not set — cannot sign preview tokens");
  }
  return secret;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function sign(payload: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(payload).digest();
}

export function signPreviewToken(candidate: SourceCandidate): string {
  const secret = getSecret();
  const now = Date.now();
  const payload: PreviewTokenPayload = { candidate, issuedAt: now, expiresAt: now + TOKEN_TTL_MS };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf-8"));
  const signatureB64 = base64url(sign(payloadB64, secret));
  return `${payloadB64}.${signatureB64}`;
}

/** Verifies signature + expiry and returns the server-validated candidate.
 *  Throws ConnectorError("INVALID_URL", ...) — a stable, generic 400 — for
 *  every failure mode (missing/malformed/tampered/expired) so the client
 *  can't distinguish *why* a token was rejected. */
export function verifyPreviewToken(token: string | undefined | null): SourceCandidate {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw new ConnectorError("INVALID_URL", "缺少或格式不正確的 previewToken");
  }
  const secret = getSecret();
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) {
    throw new ConnectorError("INVALID_URL", "缺少或格式不正確的 previewToken");
  }

  let expectedSig: Buffer;
  let providedSig: Buffer;
  try {
    expectedSig = sign(payloadB64, secret);
    providedSig = Buffer.from(signatureB64, "base64url");
  } catch {
    throw new ConnectorError("INVALID_URL", "previewToken 格式不正確");
  }

  if (expectedSig.length !== providedSig.length || !crypto.timingSafeEqual(expectedSig, providedSig)) {
    throw new ConnectorError("INVALID_URL", "previewToken 驗證失敗");
  }

  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as PreviewTokenPayload;
  } catch {
    throw new ConnectorError("INVALID_URL", "previewToken 格式不正確");
  }

  if (!payload.candidate || typeof payload.expiresAt !== "number") {
    throw new ConnectorError("INVALID_URL", "previewToken 內容不正確");
  }
  if (Date.now() > payload.expiresAt) {
    throw new ConnectorError("INVALID_URL", "previewToken 已過期，請重新偵測");
  }

  return payload.candidate;
}
