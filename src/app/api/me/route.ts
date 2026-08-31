import { NextRequest } from "next/server";
import { requireSession, requireTrustedOrigin, checkRateLimit, privateJson } from "@/lib/apiGuard";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  return privateJson({
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    professionKey: session.user.professionKey,
    customProfession: session.user.customProfession,
    onboardingCompleted: session.user.onboardingCompleted,
  });
}

/**
 * Permanently deletes the current user's own account and everything scoped to
 * it (Account/Session links, UserCategory, Subscription, ArticleState — all
 * cascade via the Prisma schema's onDelete: Cascade on User). A Source row is
 * NEVER deleted here — Subscription.onDelete: Cascade only removes this
 * user's link to it; other users' Subscriptions to the same Source are
 * untouched, and Source.createdByUserId is set to null (onDelete: SetNull)
 * rather than the Source being removed.
 */
export async function DELETE(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "delete-account", 5, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  await prisma.user.delete({ where: { id: session.user.id } });
  return privateJson({ ok: true });
}
