import { NextRequest } from "next/server";
import { setArticleState } from "@/lib/db/articleState";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/article-states/[articleId]">) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "article-state", 300, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const { articleId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const read = typeof body?.read === "boolean" ? body.read : undefined;
  const saved = typeof body?.saved === "boolean" ? body.saved : undefined;

  try {
    await setArticleState(session.user.id, articleId, { read, saved });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
