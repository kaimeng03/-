import { NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  checkPassword,
  createSessionCookieValue,
  isAdminConfigured,
} from "@/lib/adminAuth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return Response.json({ error: "管理功能尚未設定" }, { status: 501 });
  }

  const limit = rateLimit(`admin-login:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return Response.json({ error: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!checkPassword(password)) {
    return Response.json({ error: "密碼錯誤" }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  // Secure is only added in production — localhost http:// dev would otherwise
  // silently fail to set the cookie in some browsers.
  const secureAttr = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.set(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${createSessionCookieValue()}; Path=/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=${ADMIN_COOKIE_MAX_AGE_SECONDS}`,
  );
  return res;
}
