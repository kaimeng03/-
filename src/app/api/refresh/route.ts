import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { FEEDS_CACHE_TAG } from "@/lib/feeds";
import { checkRateLimit, requireSession, requireTrustedOrigin } from "@/lib/apiGuard";

export const runtime = "nodejs";

/** True only for a request carrying the server-only CRON_SECRET — lets a
 *  scheduler trigger a refresh without a user session. Never trusted unless
 *  CRON_SECRET is actually configured (an unset secret must never match). */
function isTrustedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const expectedBytes = Buffer.from(secret);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(req: NextRequest) {
  // A manual refresh forces real network fetches against every configured RSS
  // feed, so it must not be anonymously triggerable: either a logged-in
  // user's session, or — for scheduled/automated refreshes — the server-only
  // CRON_SECRET. Still rate-limited either way.
  if (!isTrustedCronRequest(req)) {
    const originError = requireTrustedOrigin(req);
    if (originError) return originError;
    const session = await requireSession();
    if (session instanceof Response) return session;
  }

  const rateLimitError = checkRateLimit(req, "refresh", 6, 60 * 1000);
  if (rateLimitError) return rateLimitError;

  // revalidateTag purges the underlying per-feed fetch() cache entries (which are
  // otherwise fresh for up to 15 minutes), so the next render performs a genuine
  // network re-fetch of every RSS feed rather than reusing stale data. This runs in
  // a Route Handler (not a Server Action), so `updateTag` isn't available; per the
  // Next.js 16 docs, `{ expire: 0 }` is the documented way to force the data gone
  // immediately from that context, instead of the stale-while-revalidate default.
  revalidateTag(FEEDS_CACHE_TAG, { expire: 0 });
  revalidatePath("/");
  return Response.json({ ok: true });
}
