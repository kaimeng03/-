import { NextRequest } from "next/server";
import { safeFetch, capStream, UnsafeUrlError } from "@/lib/safeFetch";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

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

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new Response("Not an image", { status: 415 });
    }

    // Deliberately not forwarding any other upstream headers (Set-Cookie included) —
    // only Content-Type and our own Cache-Control make it into the response.
    return new Response(capStream(upstream.body, MAX_IMAGE_BYTES), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return new Response("Blocked", { status: 400 });
    return new Response("Fetch failed", { status: 502 });
  }
}
