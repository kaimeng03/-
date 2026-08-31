import { NextRequest } from "next/server";
import { checkRateLimit, privateJson, requireSession } from "@/lib/apiGuard";
import { getUserSourcesConfig } from "@/lib/db/userSources";
import { fetchAllArticles } from "@/lib/feeds";

export const runtime = "nodejs";

/**
 * Loads the signed-in user's news independently from the page shell. External
 * feeds and optional translation can be slow, so keeping this work out of the
 * initial server render makes navigation, categories, and Add Website usable
 * immediately. The source list always comes from the authenticated session;
 * the client cannot ask for another user's feeds.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const rateLimitError = checkRateLimit(req, "articles", 60, 60 * 60 * 1000, session.user.id);
  if (rateLimitError) return rateLimitError;

  const { sources } = await getUserSourcesConfig(session.user.id);
  const result = sources.length === 0
    ? { articles: [], failedSourceNames: [] }
    : await fetchAllArticles(sources);

  return privateJson({ ...result, lastUpdated: new Date().toISOString() });
}
