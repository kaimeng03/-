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

describe("NewsApp — add/delete are always usable once logged in (no separate admin gate)", () => {
  it("shows Add Website / Add Category buttons and delete (✕) buttons", async () => {
    mockFetchSequence({});
    render(<NewsApp {...baseProps()} />);

    await waitFor(() => expect(screen.getByText("＋ 新增網站")).toBeInTheDocument());
    expect(screen.getByText("＋ 新增分類")).toBeInTheDocument();
    expect(screen.getByLabelText("取消追蹤 ArchDaily")).toBeInTheDocument();
    expect(screen.getByLabelText("刪除分類 建築新聞")).toBeInTheDocument();
  });

  it("clicking Add Website opens the unified add-source flow directly — no login prompt of any kind", async () => {
    mockFetchSequence({});
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("＋ 新增網站")).toBeInTheDocument());

    fireEvent.click(screen.getByText("＋ 新增網站"));

    // The unified flow's three equal entry points (precise/curated, search, manual).
    expect(await screen.findByText("精選來源")).toBeInTheDocument();
    expect(screen.getByText("搜尋全部來源")).toBeInTheDocument();
    expect(screen.getByText("自行新增")).toBeInTheDocument();
  });

  it("the manual-add tab shows the URL/RSS/DOI/ISSN input", async () => {
    mockFetchSequence({});
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("＋ 新增網站")).toBeInTheDocument());
    fireEvent.click(screen.getByText("＋ 新增網站"));
    fireEvent.click(await screen.findByText("自行新增"));

    expect(await screen.findByPlaceholderText("貼上想追蹤的網站網址")).toBeInTheDocument();
  });

  it("detects, confirms, and reports a successful self-added source", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/confirm")) {
          return { ok: true, json: async () => ({ source: { id: "new-source" } }) } as Response;
        }
        if (url === "/api/source-discovery") {
          return {
            ok: true,
            json: async () => ({
              inputType: "url",
              detectedUrl: "https://example.com/feed.xml",
              candidate: { name: "Example News" },
              previewToken: "signed-preview-token",
              articles: [{ title: "Example article", summary: null, canonicalUrl: "https://example.com/article", publishedAt: null }],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    render(<NewsApp {...baseProps()} />);
    fireEvent.click(await screen.findByText("＋ 新增網站"));
    fireEvent.click(await screen.findByText("自行新增"));
    fireEvent.change(await screen.findByPlaceholderText("貼上想追蹤的網站網址"), {
      target: { value: "https://example.com/news" },
    });
    fireEvent.click(screen.getByText("偵測"));
    fireEvent.click(await screen.findByText("確認新增"));

    expect(await screen.findByText("已成功加入新聞來源")).toBeInTheDocument();
    expect(calls).toContain("/api/source-discovery/confirm");
  });

  it("clicking ✕ on a source opens the remove-confirmation dialog directly", async () => {
    mockFetchSequence({});
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByLabelText("取消追蹤 ArchDaily")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("取消追蹤 ArchDaily"));

    expect(await screen.findByText("確定要取消追蹤「ArchDaily」嗎？")).toBeInTheDocument();
  });

  it("clicking Add Category opens the form directly", async () => {
    mockFetchSequence({});
    render(<NewsApp {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("＋ 新增分類")).toBeInTheDocument());

    fireEvent.click(screen.getByText("＋ 新增分類"));

    expect(await screen.findByPlaceholderText("分類名稱，例如：室內設計")).toBeInTheDocument();
  });
});

describe("NewsApp — fast page shell with deferred news loading", () => {
  it("keeps navigation usable while articles load independently", async () => {
    let resolveArticles!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => {
        resolveArticles = resolve;
      })),
    );

    render(<NewsApp {...baseProps()} loadArticlesClientSide />);

    expect(screen.getByText("＋ 新增網站")).toBeInTheDocument();
    expect(await screen.findByText("正在載入你的新聞…")).toBeInTheDocument();

    resolveArticles({
      ok: true,
      json: async () => ({
        articles: [{
          id: "article-1",
          link: "https://example.com/article-1",
          sourceId: "archdaily",
          sourceName: "ArchDaily",
          categoryId: "architecture-news",
          pubDate: null,
          thumbnail: null,
          titleEn: "Fast article shell test",
          titleZh: "快速載入測試文章",
          summaryEn: "Summary",
          summaryZh: "摘要",
          feedHtmlEn: null,
          contentMode: "extract",
        }],
        failedSourceNames: [],
        lastUpdated: new Date().toISOString(),
      }),
    } as Response);

    expect(await screen.findByText("快速載入測試文章")).toBeInTheDocument();
  });
});

describe("NewsApp — non-empty category deletion requires real two-step confirmation", () => {
  it("does not call DELETE after the first confirmation; only after the second", async () => {
    const deleteCalls: string[] = [];
    mockFetchSequence({
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
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
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
