import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { removeSource, NotFoundError } from "@/lib/sourceStore";
import { requireAdmin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/sources/[id]">) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  const rateLimitError = checkRateLimit(req, "mutate-sources", 20, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const { id } = await ctx.params;

  try {
    await removeSource(id);
    revalidatePath("/");
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error(`Failed to remove source ${id}:`, err);
    return Response.json({ error: "刪除失敗，請稍後再試" }, { status: 502 });
  }
}
