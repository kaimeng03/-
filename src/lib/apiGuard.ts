import type { NextRequest } from "next/server";
import { isAdminRequest, isAdminConfigured } from "./adminAuth";
import { rateLimit, clientIp } from "./rateLimit";
import { checkTrustedOrigin } from "./csrf";

/** Returns a 403 Response if the request's Origin isn't one of our own trusted
 *  origins, else null. Call this before requireAdmin on any mutation route. */
export function requireTrustedOrigin(req: NextRequest): Response | null {
  const result = checkTrustedOrigin(req);
  if (!result.ok) {
    return Response.json({ error: "跨來源請求已被拒絕" }, { status: 403 });
  }
  return null;
}

/** Returns a 401/501 Response if the request isn't an authenticated admin, else null. */
export function requireAdmin(req: NextRequest): Response | null {
  if (!isAdminConfigured()) {
    return Response.json(
      { error: "此功能尚未設定管理密碼，暫時無法使用" },
      { status: 501 },
    );
  }
  if (!isAdminRequest(req)) {
    return Response.json({ error: "需要管理者登入" }, { status: 401 });
  }
  return null;
}

/** Returns a 429 Response if the caller has exceeded the given limit, else null. */
export function checkRateLimit(req: NextRequest, bucket: string, limit: number, windowMs: number): Response | null {
  const result = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (!result.ok) {
    return Response.json(
      { error: "操作過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  return null;
}
