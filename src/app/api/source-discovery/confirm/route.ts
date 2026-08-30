import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";
import { addSourceFromCandidate } from "@/lib/db/userSources";
import { NotFoundError } from "@/lib/sourceStore";
import { connectorErrorResponse } from "@/lib/connectors/errors";
import { verifyPreviewToken } from "@/lib/connectors/previewToken";

export const runtime = "nodejs";

/**
 * Creates the Source (if new) + the current user's Subscription — but only
 * from a server-signed previewToken (see /api/source-discovery), never from a
 * client-supplied candidate object. This is the explicit "confirm" step,
 * never triggered automatically, and it never re-calls the external provider.
 */
export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "mutate-sources", 20, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : "";

  try {
    const candidate = verifyPreviewToken(typeof body?.previewToken === "string" ? body.previewToken : null);
    if (!categoryId) {
      return Response.json({ errorCode: "INVALID_URL", message: "請選擇分類" }, { status: 400 });
    }

    const source = await addSourceFromCandidate(session.user.id, candidate, categoryId);
    revalidatePath("/");
    return Response.json({ source });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json({ errorCode: "INVALID_URL", message: err.message }, { status: 404 });
    }
    const { body: errorBody, status } = connectorErrorResponse(err);
    return Response.json(errorBody, { status });
  }
}
