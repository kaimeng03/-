import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addUserCategory } from "@/lib/db/userSources";
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
  if (name.length > 100) {
    return Response.json({ error: "分類名稱過長" }, { status: 400 });
  }

  try {
    const category = await addUserCategory(session.user.id, name);
    revalidatePath("/");
    return Response.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : "新增分類失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
