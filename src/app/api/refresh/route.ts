import { revalidatePath, revalidateTag } from "next/cache";
import { FEEDS_CACHE_TAG } from "@/lib/feeds";

export async function POST() {
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
