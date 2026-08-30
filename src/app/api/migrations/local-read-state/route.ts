import { NextRequest } from "next/server";
import { getLegacyReadStateImportStatus, importLocalReadState } from "@/lib/db/legacyImport";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const status = await getLegacyReadStateImportStatus(session.user.id);
  return Response.json(status);
}

export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "legacy-import", 5, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "格式不正確" }, { status: 400 });
  }

  const result = await importLocalReadState(session.user.id, { read: body.read, saved: body.saved });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
