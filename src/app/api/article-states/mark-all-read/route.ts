import { NextRequest } from "next/server";
import { markAllRead, MARK_ALL_READ_BATCH_LIMIT } from "@/lib/db/articleState";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "article-state", 300, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const articleIds = Array.isArray(body?.articleIds)
    ? body.articleIds.filter((id: unknown) => typeof id === "string").slice(0, MARK_ALL_READ_BATCH_LIMIT)
    : [];

  const count = await markAllRead(session.user.id, articleIds);
  return Response.json({ ok: true, count });
}
