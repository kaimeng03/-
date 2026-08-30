import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const addSourceFromCandidateMock = vi.fn();
vi.mock("@/lib/db/userSources", () => ({ addSourceFromCandidate: (...args: unknown[]) => addSourceFromCandidateMock(...args) }));

import { POST } from "./route";
import { auth } from "@/auth";
import { signPreviewToken } from "@/lib/connectors/previewToken";
import type { SourceCandidate } from "@/lib/connectors/types";

const mockedAuth = vi.mocked(auth);

function fakeSession(userId = "user-1"): Session {
  return {
    user: { id: userId, professionKey: null, customProfession: null, onboardingCompleted: true, role: "user" },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  } as Session;
}

function makeRequest(body: unknown, origin: string | null = "https://example.com"): NextRequest {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "origin" ? origin : null) },
    cookies: { get: () => undefined },
    json: async () => body,
  } as unknown as NextRequest;
}

const candidate: SourceCandidate = {
  provider: "generic",
  connectorType: "rss",
  name: "Test",
  homepage: "https://example.com",
  feedUrl: "https://example.com/rss",
};

beforeEach(() => {
  addSourceFromCandidateMock.mockReset();
  mockedAuth.mockReset();
  process.env.AUTH_SECRET = "test-secret";
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.AUTH_SECRET;
});

describe("POST /api/source-discovery/confirm — only trusts a server-signed previewToken", () => {
  it("rejects a bare client-supplied candidate (no previewToken field at all)", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    const res = await POST(makeRequest({ candidate, categoryId: "cat-1" }));
    expect(res.status).toBe(400);
    expect(addSourceFromCandidateMock).not.toHaveBeenCalled();
  });

  it("rejects a forged/tampered previewToken", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    const token = signPreviewToken(candidate);
    const forged = token.slice(0, -2) + "xx";
    const res = await POST(makeRequest({ previewToken: forged, categoryId: "cat-1" }));
    expect(res.status).toBe(400);
    expect(addSourceFromCandidateMock).not.toHaveBeenCalled();
  });

  it("succeeds with a valid previewToken, using the token's own (not client-supplied) candidate", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-42") as never);
    addSourceFromCandidateMock.mockResolvedValue({ id: "src-1", name: candidate.name });
    const token = signPreviewToken(candidate);

    const res = await POST(makeRequest({ previewToken: token, categoryId: "cat-1" }));
    expect(res.status).toBe(200);
    expect(addSourceFromCandidateMock).toHaveBeenCalledWith("user-42", candidate, "cat-1");
  });

  it("still requires a categoryId even with a valid token", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    const token = signPreviewToken(candidate);
    const res = await POST(makeRequest({ previewToken: token }));
    expect(res.status).toBe(400);
    expect(addSourceFromCandidateMock).not.toHaveBeenCalled();
  });

  it("propagates a category-ownership rejection from the data layer as 404 (someone else's categoryId)", async () => {
    mockedAuth.mockResolvedValue(fakeSession() as never);
    const { NotFoundError } = await import("@/lib/sourceStore");
    addSourceFromCandidateMock.mockRejectedValue(new NotFoundError("找不到這個分類"));
    const token = signPreviewToken(candidate);

    const res = await POST(makeRequest({ previewToken: token, categoryId: "someone-elses-category" }));
    expect(res.status).toBe(404);
  });

  it("returns 401 when there is no session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const token = signPreviewToken(candidate);
    const res = await POST(makeRequest({ previewToken: token, categoryId: "cat-1" }));
    expect(res.status).toBe(401);
  });
});
