import { NextRequest } from "next/server";
import { updateUserPreferences } from "@/lib/db/userSources";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "update-preferences", 30, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const professionKey =
    typeof body?.professionKey === "string" ? body.professionKey : body?.professionKey === null ? null : undefined;
  const customProfession =
    typeof body?.customProfession === "string"
      ? body.customProfession.slice(0, 100)
      : body?.customProfession === null
        ? null
        : undefined;
  const onboardingCompleted = typeof body?.onboardingCompleted === "boolean" ? body.onboardingCompleted : undefined;

  try {
    await updateUserPreferences(session.user.id, { professionKey, customProfession, onboardingCompleted });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
