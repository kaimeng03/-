import { NextRequest } from "next/server";
import { privateJson, requireSession } from "@/lib/apiGuard";
import { searchCatalog } from "@/lib/db/userSources";
import { isKnownProfessionKey } from "@/lib/professions";

export const runtime = "nodejs";

const CONTENT_TYPES = new Set(["news", "magazine", "journal", "government", "guideline", "preprint", "blog", "other"]);
const ACCESS_TYPES = new Set(["free", "open_access", "partial", "subscription", "unknown"]);

/** Only an allowlisted, known value is passed through to Prisma — anything
 *  else is treated as "no filter" rather than forwarded as an arbitrary
 *  enum-typed value. */
function allowlisted(value: string | null, allowed: Set<string>): string | undefined {
  return value && allowed.has(value) ? value : undefined;
}

/** "搜尋全部來源" — searches the curated catalog across every profession. */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const params = req.nextUrl.searchParams;
  const rawQuery = params.get("query");
  const query = rawQuery ? rawQuery.slice(0, 200) : undefined;
  const professionParam = params.get("profession");
  const professionKey = professionParam && isKnownProfessionKey(professionParam) ? professionParam : undefined;
  const language = params.get("language")?.slice(0, 20) || undefined;
  const country = params.get("country")?.slice(0, 10) || undefined;
  const contentType = allowlisted(params.get("contentType"), CONTENT_TYPES);
  const accessType = allowlisted(params.get("accessType"), ACCESS_TYPES);

  const sources = await searchCatalog(session.user.id, { query, professionKey, language, country, contentType, accessType });
  return privateJson({ sources });
}
