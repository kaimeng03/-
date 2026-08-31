import { NextRequest } from "next/server";
import { privateJson, requireSession } from "@/lib/apiGuard";
import { getRecommendedSources } from "@/lib/db/userSources";

export const runtime = "nodejs";

/** Curated recommendations for a profession. `profession` may be passed to
 *  browse a different profession's catalog than the user's own default —
 *  browsing another profession never limits what a user can follow. */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const professionParam = req.nextUrl.searchParams.get("profession");
  const professionKey = professionParam || session.user.professionKey;

  const sources = await getRecommendedSources(session.user.id, professionKey);
  return privateJson({ sources });
}
