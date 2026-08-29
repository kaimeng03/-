import { NextRequest } from "next/server";
import { extractArticle } from "@/lib/extract";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json({ error: "缺少 url 參數" }, { status: 400 });
  }
  try {
    const article = await extractArticle(url);
    return Response.json(article, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "擷取內文失敗";
    return Response.json(
      { error: message },
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
}
