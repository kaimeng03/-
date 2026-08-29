import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addCategory } from "@/lib/sourceStore";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";

  try {
    const category = await addCategory(name);
    revalidatePath("/");
    return Response.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : "新增分類失敗";
    return Response.json({ error: message }, { status: 400 });
  }
}
