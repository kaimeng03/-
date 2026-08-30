import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addUserSource } from "@/lib/db/userSources";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "mutate-sources", 20, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const feedUrl = typeof body?.feedUrl === "string" ? body.feedUrl : "";
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : "";
  if (name.length > 200 || feedUrl.length > 2000) {
    return Response.json({ error: "輸入內容過長" }, { status: 400 });
  }

  try {
    const source = await addUserSource(session.user.id, { name, feedUrl, categoryId });
    revalidatePath("/");
    return Response.json({ source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "新增網站失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
