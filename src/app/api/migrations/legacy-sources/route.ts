import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getLegacySourcesImportStatus, importLegacySources } from "@/lib/db/legacyImport";
import { requireSession, requireTrustedOrigin, checkRateLimit, privateJson } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const status = await getLegacySourcesImportStatus(session.user.id, session.user.email);
  return privateJson(status);
}

export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "legacy-import", 5, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  try {
    const result = await importLegacySources(session.user.id, session.user.email);
    revalidatePath("/");
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "匯入失敗";
    const status = message === "沒有權限匯入舊版資料" ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
