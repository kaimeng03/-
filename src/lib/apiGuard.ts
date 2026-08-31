import type { NextRequest } from "next/server";
import { rateLimit, clientIp } from "./rateLimit";
import { checkTrustedOrigin } from "./csrf";
import type { Session } from "next-auth";

/** Returns a 403 Response if the request's Origin isn't one of our own trusted
 *  origins, else null. Call this before requireSession on any mutation route. */
export function requireTrustedOrigin(req: NextRequest): Response | null {
  const result = checkTrustedOrigin(req);
  if (!result.ok) {
    return privateJson({ error: "跨來源請求已被拒絕" }, { status: 403 });
  }
  return null;
}

/**
 * Resolves the current user's session strictly from the server-side cookie —
 * never from any client-supplied body/query/path value. Returns either the
 * session or a 401 Response, so callers can `if (!("user" in result)) return result;`.
 */
export async function requireSession(): Promise<Session | Response> {
  // Imported lazily so routes/tests that never call requireSession() don't pay
  // the cost of loading the Auth.js/Prisma machinery.
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user) {
    return privateJson({ error: "需要登入" }, { status: 401 });
  }
  return session;
}

/** Returns a 429 Response if the caller has exceeded the given limit, else null. */
export function checkRateLimit(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
  subject?: string,
): Response | null {
  // Expensive authenticated endpoints can use the stable session user id
  // instead of a spoofable/shared client IP. Existing callers remain IP-based.
  const result = rateLimit(`${bucket}:${subject || clientIp(req)}`, limit, windowMs);
  if (!result.ok) {
    return privateJson(
      { error: "操作過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  return null;
}

/** Session-scoped or security-sensitive JSON must not be stored by a browser,
 * CDN, or shared intermediary. */
export function privateJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  return Response.json(data, { ...init, headers });
}
