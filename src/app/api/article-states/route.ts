import { requireSession } from "@/lib/apiGuard";
import { getArticleStates } from "@/lib/db/articleState";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const states = await getArticleStates(session.user.id);
  return Response.json(states);
}
