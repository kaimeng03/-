import { NextRequest } from "next/server";
import { requireSession, requireTrustedOrigin, checkRateLimit, privateJson } from "@/lib/apiGuard";
import { createSourceSubmission, listUserSourceSubmissions } from "@/lib/db/sourceSubmissions";
import type { ConnectorErrorCode } from "@/lib/connectors/errors";

export const runtime = "nodejs";

const INPUT_TYPES = new Set(["url", "rss", "doi", "issn", "journal_name", "keyword", "unknown"]);
const FAILURE_CODES: Set<ConnectorErrorCode> = new Set([
  "INVALID_URL",
  "UNSAFE_URL",
  "NO_FEED_FOUND",
  "INVALID_FEED",
  "ACCESS_BLOCKED",
  "LOGIN_REQUIRED",
  "RATE_LIMITED",
  "FETCH_TIMEOUT",
  "UNSUPPORTED_SOURCE",
  "DUPLICATE_SUBSCRIPTION",
  "PROVIDER_UNAVAILABLE",
  "NO_RESULTS",
]);

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const submissions = await listUserSourceSubmissions(session.user.id);
  return privateJson({ submissions });
}

export async function POST(req: NextRequest) {
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "source-submissions", 20, 60 * 60 * 1000);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.slice(0, 500) : "";
  const inputType = typeof body?.inputType === "string" && INPUT_TYPES.has(body.inputType) ? body.inputType : "unknown";
  const rawDetectedUrl = typeof body?.detectedUrl === "string" ? body.detectedUrl.slice(0, 2000) : null;
  const detectedUrl = rawDetectedUrl && /^https?:\/\//i.test(rawDetectedUrl) ? rawDetectedUrl : null;
  const failureCode = typeof body?.failureCode === "string" && FAILURE_CODES.has(body.failureCode as ConnectorErrorCode) ? body.failureCode : null;
  const failureReason = typeof body?.failureReason === "string" ? body.failureReason.slice(0, 500) : null;

  try {
    const submission = await createSourceSubmission(session.user.id, { input, inputType, detectedUrl, failureCode, failureReason });
    return Response.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : "提交失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
