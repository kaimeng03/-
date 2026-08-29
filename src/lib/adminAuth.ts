import crypto from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "admin_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string | null {
  // Derived from the admin password itself so no second secret needs managing —
  // if the password changes, all existing sessions are invalidated automatically.
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return crypto.createHash("sha256").update(password).digest("hex");
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Is admin auth even configured? If not, mutation routes should refuse everyone. */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkPassword(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !candidate) return false;
  return timingSafeEqual(candidate, password);
}

export function createSessionCookieValue(): string {
  const secret = getSecret();
  if (!secret) throw new Error("Admin auth not configured");
  const expires = Date.now() + SESSION_DURATION_MS;
  const payload = String(expires);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  const secret = getSecret();
  if (!secret) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  if (!timingSafeEqual(sign(payload, secret), signature)) return false;
  const expires = Number(payload);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return true;
}

export function isAdminRequest(req: NextRequest): boolean {
  const cookie = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return verifySessionCookieValue(cookie);
}

export const ADMIN_COOKIE_MAX_AGE_SECONDS = Math.floor(SESSION_DURATION_MS / 1000);
