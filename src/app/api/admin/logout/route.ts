import { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";
import { requireTrustedOrigin } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;

  const res = Response.json({ ok: true });
  res.headers.set("Set-Cookie", `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
  return res;
}
