import { NextRequest } from "next/server";
import { safeFetch, capStream, UnsafeUrlError } from "@/lib/safeFetch";
import { checkRateLimit, requireSession } from "@/lib/apiGuard";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_URL_CHARS = 4_096;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/apng",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
]);

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const rateLimitError = checkRateLimit(req, "image-proxy", 1_000, 60 * 60 * 1000, session.user.id);
  if (rateLimitError) return rateLimitError;

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });
  if (url.length > MAX_URL_CHARS) return new Response("URL too long", { status: 414 });

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  try {
    const { response: upstream } = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)",
        Referer: `https://${hostname}/`,
        Accept: "image/*",
      },
      // Images are streamed straight through, not parsed as JSON/text, and can be
      // several MB — Next's fetch Data Cache silently refuses (and warns on) any
      // entry over 2MB, so it's the wrong cache for this passthrough. The
      // Cache-Control header on our own response below is what actually caches
      // these for the browser/CDN.
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", { status: 502 });
    }

    const contentType = (upstream.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    // SVG is active content when opened as a same-origin document. Passing only
    // known raster formats prevents the proxy from becoming a script host.
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return new Response("Not an image", { status: 415 });
    }

    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    // Deliberately not forwarding any other upstream headers (Set-Cookie included) —
    // only Content-Type and our own Cache-Control make it into the response.
    return new Response(capStream(upstream.body, MAX_IMAGE_BYTES), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return new Response("Blocked", { status: 400 });
    return new Response("Fetch failed", { status: 502 });
  }
}
