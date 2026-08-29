import { NextRequest } from "next/server";
import { assertPublicHttpUrl } from "@/lib/safeFetch";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = assertPublicHttpUrl(url);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)",
        Referer: `${parsed.protocol}//${parsed.hostname}/`,
        Accept: "image/*",
      },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new Response("Not an image", { status: 415 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Fetch failed", { status: 502 });
  }
}
