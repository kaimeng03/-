import { NextRequest } from "next/server";
import { requireSession, requireTrustedOrigin, checkRateLimit } from "@/lib/apiGuard";
import { discoverSource, type ProviderChoice } from "@/lib/connectors/discover";
import { connectorErrorResponse } from "@/lib/connectors/errors";
import { signPreviewToken } from "@/lib/connectors/previewToken";

export const runtime = "nodejs";

const VALID_PROVIDERS: ProviderChoice[] = ["auto", "crossref", "europepmc", "pubmed"];

/**
 * Preview-only: classifies the input (URL/RSS/DOI/ISSN/journal name/keyword)
 * and returns candidate + a sample of articles, plus a short-lived signed
 * previewToken. Never creates a Source or Subscription — that only happens
 * via POST /api/source-discovery/confirm with that token, after the user has
 * seen this preview and explicitly confirmed.
 */
export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "source-discovery", 30, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input : "";
  const provider: ProviderChoice = VALID_PROVIDERS.includes(body?.provider) ? body.provider : "auto";

  try {
    const preview = await discoverSource(input, provider);
    const previewToken = preview.candidate ? signPreviewToken(preview.candidate) : null;
    return Response.json({ ...preview, previewToken });
  } catch (err) {
    const { body: errorBody, status } = connectorErrorResponse(err);
    return Response.json(errorBody, { status });
  }
}
