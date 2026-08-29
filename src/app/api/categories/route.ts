import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addCategory } from "@/lib/sourceStore";
import { requireAdmin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  const rateLimitError = checkRateLimit(req, "mutate-sources", 20, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";

  try {
    const category = await addCategory(name);
    revalidatePath("/");
    return Response.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : "新增分類失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
