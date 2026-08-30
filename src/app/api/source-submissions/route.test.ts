import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const createSourceSubmissionMock = vi.fn();
const listUserSourceSubmissionsMock = vi.fn();
vi.mock("@/lib/db/sourceSubmissions", () => ({
  createSourceSubmission: (...args: unknown[]) => createSourceSubmissionMock(...args),
  listUserSourceSubmissions: (...args: unknown[]) => listUserSourceSubmissionsMock(...args),
}));

import { GET, POST } from "./route";
import { auth } from "@/auth";

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

beforeEach(() => {
  createSourceSubmissionMock.mockReset().mockResolvedValue({ id: "sub-1" });
  listUserSourceSubmissionsMock.mockReset();
  mockedAuth.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/source-submissions — session-scoped", () => {
  it("returns 401 without a session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listUserSourceSubmissionsMock).not.toHaveBeenCalled();
  });

  it("lists only the session user's own submissions — userId always comes from the session, never the client", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-42") as never);
    listUserSourceSubmissionsMock.mockResolvedValue([{ id: "sub-1", userId: "user-42" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listUserSourceSubmissionsMock).toHaveBeenCalledWith("user-42");
  });
});

describe("POST /api/source-submissions — field validation", () => {
  it("rejects an untrusted origin", async () => {
    const res = await POST(makeRequest({ input: "x" }, "https://evil.example.net"));
    expect(res.status).toBe(403);
    expect(createSourceSubmissionMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest({ input: "x" }));
    expect(res.status).toBe(401);
  });

  it("normalizes an invalid inputType to 'unknown' rather than storing arbitrary text", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-1") as never);
    await POST(makeRequest({ input: "x", inputType: "<script>alert(1)</script>" }));
    expect(createSourceSubmissionMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ inputType: "unknown" }));
  });

  it("drops an invalid failureCode instead of storing an arbitrary string", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-1") as never);
    await POST(makeRequest({ input: "x", failureCode: "NOT_A_REAL_CODE" }));
    expect(createSourceSubmissionMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ failureCode: null }));
  });

  it("accepts a valid failureCode", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-1") as never);
    await POST(makeRequest({ input: "x", failureCode: "RATE_LIMITED" }));
    expect(createSourceSubmissionMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ failureCode: "RATE_LIMITED" }));
  });

  it("drops a detectedUrl that isn't actually a URL", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-1") as never);
    await POST(makeRequest({ input: "x", detectedUrl: "javascript:alert(1)" }));
    expect(createSourceSubmissionMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ detectedUrl: null }));
  });

  it("always uses the session's userId, ignoring any client-supplied userId field", async () => {
    mockedAuth.mockResolvedValue(fakeSession("user-1") as never);
    await POST(makeRequest({ input: "x", userId: "someone-elses-id" }));
    expect(createSourceSubmissionMock).toHaveBeenCalledWith("user-1", expect.anything());
  });
});
