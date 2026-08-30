import { NextRequest } from "next/server";
import { requireSession, checkRateLimit } from "@/lib/apiGuard";
import { getCuratedSourceForPreview } from "@/lib/db/userSources";
import { fetchSourcePreview } from "@/lib/feeds";

export const runtime = "nodejs";

/** Read-only preview. It never creates a Subscription; following remains a
 * separate, explicit POST to /api/recommendations/follow. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/catalog/[id]/preview">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "catalog-preview", 60, 10 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const { id } = await ctx.params;
  const source = await getCuratedSourceForPreview(id);
  if (!source) return Response.json({ error: "找不到這個精選來源" }, { status: 404 });

  try {
    const articles = await fetchSourcePreview(source, 5);
    return Response.json({
      source: { id: source.id, name: source.name, homepage: source.homepage },
      articles,
    });
  } catch (err) {
    console.warn(`Catalog preview unavailable for ${source.name}:`, err instanceof Error ? err.message : err);
    return Response.json({ error: "暫時無法載入預覽，請稍後再試" }, { status: 502 });
  }
}
