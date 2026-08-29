import { ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.set("Set-Cookie", `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
  return res;
}
