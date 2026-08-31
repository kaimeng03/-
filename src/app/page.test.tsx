import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Source } from "@/lib/sources";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/db/userSources", () => ({ getUserSourcesConfig: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import Home from "./page";
import { auth } from "@/auth";
import { getUserSourcesConfig } from "@/lib/db/userSources";

const mockedAuth = vi.mocked(auth);
const mockedGetUserSourcesConfig = vi.mocked(getUserSourcesConfig);

beforeEach(() => {
  vi.restoreAllMocks();
  mockedAuth.mockReset();
  mockedGetUserSourcesConfig.mockReset();
  delete process.env.AUTH_GOOGLE_ID;
  delete process.env.AUTH_GOOGLE_SECRET;
});

function fakeSession(userId = "u1", onboardingCompleted = true) {
  return {
    user: { id: userId, name: "Alice", email: "alice@example.com", image: null, onboardingCompleted },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  } as never;
}

describe("Home page — unauthenticated visitors", () => {
  it("shows the newskill Google-login landing page instead of any news", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const ui = await Home({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByText("newskill")).toBeInTheDocument();
    expect(mockedGetUserSourcesConfig).not.toHaveBeenCalled();
  });

  it("shows a clear message (not a blank screen) when Google OAuth isn't configured", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const ui = await Home({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByText("尚未設定 Google 登入")).toBeInTheDocument();
    expect(screen.queryByText("使用 Google 帳號登入")).not.toBeInTheDocument();
  });

  it("shows the sign-in button once Google OAuth env vars are set", async () => {
    process.env.AUTH_GOOGLE_ID = "test-client-id";
    process.env.AUTH_GOOGLE_SECRET = "test-client-secret";
    mockedAuth.mockResolvedValue(null as never);

    const ui = await Home({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByText("使用 Google 帳號登入")).toBeInTheDocument();
  });
});

describe("Home page — authenticated users", () => {
  it("loads only this user's subscribed sources and defers external article fetching", async () => {
    mockedAuth.mockResolvedValue(fakeSession("u1"));
    const sources: Source[] = [
      { id: "s1", name: "ArchDaily", homepage: "https://archdaily.com", feedUrl: "https://archdaily.com/rss", categoryId: "c1" },
    ];
    mockedGetUserSourcesConfig.mockResolvedValue({ categories: [{ id: "c1", name: "建築新聞" }], sources });

    const ui = await Home({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(mockedGetUserSourcesConfig).toHaveBeenCalledWith("u1");
    expect(screen.queryByText("使用 Google 帳號登入")).not.toBeInTheDocument();
  });

  it("issues zero RSS fetches and shows the empty-home state for a user with no subscriptions", async () => {
    mockedAuth.mockResolvedValue(fakeSession("u2"));
    mockedGetUserSourcesConfig.mockResolvedValue({ categories: [], sources: [] });

    const ui = await Home({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByText("你的新聞首頁還是空的")).toBeInTheDocument();
  });

  it("redirects a first-time user (onboardingCompleted: false) to /onboarding instead of showing news", async () => {
    mockedAuth.mockResolvedValue(fakeSession("u3", false));

    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/onboarding");
    expect(mockedGetUserSourcesConfig).not.toHaveBeenCalled();
  });
});
