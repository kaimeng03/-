import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { followRecommendedSource } from "@/lib/db/userSources";
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
  const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
  const categoryName = typeof body?.categoryName === "string" ? body.categoryName.slice(0, 100) : "";
  if (!sourceId) {
    return Response.json({ error: "缺少 sourceId" }, { status: 400 });
  }

  try {
    const source = await followRecommendedSource(session.user.id, sourceId, categoryName);
    revalidatePath("/");
    return Response.json({ source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "追蹤失敗";
    const status = message === "找不到這個新聞來源" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
