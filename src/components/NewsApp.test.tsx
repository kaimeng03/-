import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { Article } from "@/lib/types";
import type { Category, Source } from "@/lib/sources";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import NewsApp from "./NewsApp";

const categories: Category[] = [{ id: "architecture-news", name: "建築新聞" }];
const sources: Source[] = [
  {
    id: "archdaily",
    name: "ArchDaily",
    homepage: "https://www.archdaily.com",
    feedUrl: "https://www.archdaily.com/rss/",
    categoryId: "architecture-news",
  },
];
const articles: Article[] = [];

function baseProps() {
  return {
    initialArticles: articles,
    categories,
    sources,
    failedSourceNames: [],
    lastUpdated: new Date().toISOString(),
  };
}

function mockFetchSequence(handlers: Record<string, (input: RequestInit | undefined) => unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.toString().includes(pattern)) {
          const body = handler(init);
          return {
            ok: true,
            json: async () => body,
          } as Response;
        }
      }
      return { ok: true, json: async () => ({}) } as Response;
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("NewsApp — add/delete buttons stay visible regardless of login state", () => {
  it("shows Add Website / Add Category buttons and delete (✕) buttons when NOT logged in", async () => {
    mockFetchSequence({
      "/api/admin/session": () => ({ isAdmin: false, configured: true }),
    });
    render(<NewsApp {...baseProps()} />);

    await waitFor(() => expect(screen.getByText("＋ 新增網站")).toBeInTheDocument());
    expect(screen.getByText("＋ 新增分類")).toBeInTheDocument();
    expect(screen.getByLabelText("取消追蹤 ArchDaily")).toBeInTheDocument();
    expect(screen.getByLabelText("刪除分類 建築新聞")).toBeInTheDocument();
  });

  it("clicking Add Website while logged out prompts login instead of opening the form", async () => {
    mockFetchSequence({
      "/api/admin/session": () => ({ isAdmin: false, configured: true }),
    });
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("＋ 新增網站")).toBeInTheDocument());

    fireEvent.click(screen.getByText("＋ 新增網站"));

    expect(await screen.findByText("請先登入管理者才能新增網站")).toBeInTheDocument();
    // The add-source form itself must NOT have opened.
    expect(screen.queryByPlaceholderText("網站名稱")).not.toBeInTheDocument();
  });

  it("clicking ✕ on a source while logged out prompts login instead of deleting", async () => {
    mockFetchSequence({
      "/api/admin/session": () => ({ isAdmin: false, configured: true }),
    });
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByLabelText("取消追蹤 ArchDaily")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("取消追蹤 ArchDaily"));

    expect(await screen.findByText("請先登入管理者才能修改追蹤項目")).toBeInTheDocument();
  });

  it("shows a clear message (not silence) when ADMIN_PASSWORD isn't configured", async () => {
    mockFetchSequence({
      "/api/admin/session": () => ({ isAdmin: false, configured: false }),
    });
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("＋ 新增網站")).toBeInTheDocument());

    fireEvent.click(screen.getByText("＋ 新增網站"));

    expect(await screen.findByText("尚未設定管理密碼")).toBeInTheDocument();
  });
});

describe("NewsApp — non-empty category deletion requires real two-step confirmation", () => {
  it("does not call DELETE after the first confirmation; only after the second", async () => {
    const deleteCalls: string[] = [];
    mockFetchSequence({
      "/api/admin/session": () => ({ isAdmin: true, configured: true }),
      "/api/categories/architecture-news": (init) => {
        deleteCalls.push((init?.method || "GET") as string);
        return { ok: true };
      },
    });
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByLabelText("刪除分類 建築新聞")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("刪除分類 建築新聞"));

    // Step 1: mentions the source count, offers "Continue", not "Delete".
    const step1Message = await screen.findByText(/建築新聞.*還有 1 個來源/);
    expect(step1Message).toBeInTheDocument();
    expect(deleteCalls).toHaveLength(0);

    fireEvent.click(screen.getByText("繼續"));

    // Step 2: the serious, final warning — DELETE still must not have fired yet.
    expect(await screen.findByText(/永久刪除分類.*無法從網站復原/)).toBeInTheDocument();
    expect(deleteCalls).toHaveLength(0);
  });

  it("cancelling at step 2 never calls DELETE", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ isAdmin: true, configured: true }) }) as Response);
    vi.stubGlobal("fetch", fetchSpy);
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByLabelText("刪除分類 建築新聞")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("刪除分類 建築新聞"));
    fireEvent.click(await screen.findByText("繼續"));
    await screen.findByText(/永久刪除分類/);

    fetchSpy.mockClear();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByText("取消"));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("confirming at step 2 calls DELETE with force=true", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    mockFetchSequence({
      "/api/admin/session": () => ({ isAdmin: true, configured: true }),
      "/api/categories/architecture-news": (init) => {
        capturedMethod = (init?.method || "GET") as string;
        return { ok: true };
      },
    });
    // Also capture the URL via a wrapping spy since mockFetchSequence discards it.
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.toString().includes("/api/categories/architecture-news")) {
          capturedUrl = url.toString();
          capturedMethod = (init?.method || "GET") as string;
          return { ok: true, json: async () => ({ ok: true }) } as Response;
        }
        return realFetch(url, init);
      }),
    );

    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByLabelText("刪除分類 建築新聞")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("刪除分類 建築新聞"));
    fireEvent.click(await screen.findByText("繼續"));
    await screen.findByText(/永久刪除分類/);

    fireEvent.click(screen.getByText("刪除"));

    await waitFor(() => expect(capturedMethod).toBe("DELETE"));
    expect(capturedUrl).toContain("force=true");
  });

  it("deletes an empty category with a single confirmation step", async () => {
    const emptyCategorySources: Source[] = [];
    let capturedMethod = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.toString().includes("/api/admin/session")) {
          return { ok: true, json: async () => ({ isAdmin: true, configured: true }) } as Response;
        }
        if (url.toString().includes("/api/categories/architecture-news")) {
          capturedMethod = (init?.method || "GET") as string;
          return { ok: true, json: async () => ({ ok: true }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    render(<NewsApp {...baseProps()} sources={emptyCategorySources} />);
    await waitFor(() => expect(screen.getByLabelText("刪除分類 建築新聞")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("刪除分類 建築新聞"));
    expect(await screen.findByText("確定要刪除分類「建築新聞」嗎？")).toBeInTheDocument();

    fireEvent.click(screen.getByText("刪除"));

    await waitFor(() => expect(capturedMethod).toBe("DELETE"));
  });
});
