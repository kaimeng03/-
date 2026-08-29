import { NextRequest } from "next/server";
import { isAdminRequest, isAdminConfigured } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return Response.json({ isAdmin: isAdminRequest(req), configured: isAdminConfigured() });
}
