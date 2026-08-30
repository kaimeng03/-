import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Category } from "@/lib/sources";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import AddSourceFlow from "./AddSourceFlow";

const categories: Category[] = [{ id: "cat-1", name: "My Category" }];

function mockFetch(handlers: Record<string, (init?: RequestInit) => unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.toString().includes(pattern)) {
          return { ok: true, json: async () => handler(init) } as Response;
        }
      }
      return { ok: true, json: async () => ({}) } as Response;
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AddSourceFlow — curated tab shows unfollow (not just 'already following') for a followed source", () => {
  it("shows an unfollow button, and clicking it calls DELETE /api/sources/[id]", async () => {
    let deleteCalledWith: string | null = null;
    mockFetch({
      "/api/recommendations": () => ({
        sources: [
          { id: "src-1", name: "Followed Source", homepage: "https://x.com", connectorType: "rss", provider: "generic", verificationStatus: "verified", contentType: "news", alreadySubscribed: true },
        ],
      }),
      "/api/sources/src-1": (init) => {
        deleteCalledWith = (init?.method as string) || null;
        return { ok: true };
      },
    });

    render(<AddSourceFlow lang="zh" categories={categories} initialProfessionKey="tech" onDone={vi.fn()} onCancel={vi.fn()} />);

    const unfollowButton = await screen.findByText("取消追蹤");
    fireEvent.click(unfollowButton);

    await waitFor(() => expect(deleteCalledWith).toBe("DELETE"));
    await waitFor(() => expect(screen.getByText("追蹤")).toBeInTheDocument());
  });

  it("shows a follow button for a not-yet-subscribed source", async () => {
    mockFetch({
      "/api/recommendations": () => ({
        sources: [
          { id: "src-2", name: "Unfollowed Source", homepage: "https://y.com", connectorType: "rss", provider: "generic", verificationStatus: "verified", contentType: "news", alreadySubscribed: false },
        ],
      }),
    });

    render(<AddSourceFlow lang="zh" categories={categories} initialProfessionKey="tech" onDone={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText("追蹤")).toBeInTheDocument();
    expect(screen.queryByText("取消追蹤")).not.toBeInTheDocument();
  });

  it("shows browse-domain and destination-category controls on separate rows", async () => {
    mockFetch({ "/api/recommendations": () => ({ sources: [] }) });
    render(<AddSourceFlow lang="en" categories={categories} initialProfessionKey="tech" onDone={vi.fn()} onCancel={vi.fn()} />);

    const browseLabel = screen.getByText("Browse category").closest("label");
    const categoryLabel = screen.getByText("Choose a category").closest("label");
    expect(browseLabel).not.toBeNull();
    expect(categoryLabel).not.toBeNull();
    expect(browseLabel).not.toBe(categoryLabel);
    expect(browseLabel?.parentElement).toBe(categoryLabel?.parentElement);
    expect(browseLabel?.parentElement).toHaveClass("space-y-2");
    expect(browseLabel?.querySelector("select")).toHaveClass("w-full", "transition-colors");
    expect(browseLabel?.querySelector("select")).not.toHaveClass("active:scale-[0.98]");
    expect(categoryLabel?.querySelector("select")).toHaveClass("w-full", "transition-colors");
    expect(categoryLabel?.querySelector("select")).toHaveClass("focus-visible:ring-2");
  });

  it("keeps the common add-a-website path simple and collapses academic provider choices", async () => {
    mockFetch({ "/api/recommendations": () => ({ sources: [] }) });
    render(<AddSourceFlow lang="en" categories={categories} initialProfessionKey="tech" onDone={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Add Your Own"));

    expect(screen.getByPlaceholderText("Paste the website URL you want to follow")).toBeInTheDocument();
    const advanced = screen.getByText("Academic journals and advanced options").closest("details");
    expect(advanced).not.toHaveAttribute("open");
  });

  it("previews a curated source without following it", async () => {
    let followCalled = false;
    mockFetch({
      "/api/recommendations": () => ({
        sources: [{ id: "preview-source", name: "Previewable Source", homepage: "https://preview.example.com", connectorType: "rss", provider: "generic", verificationStatus: "verified", contentType: "news", alreadySubscribed: false }],
      }),
      "/api/catalog/preview-source/preview": () => ({
        articles: [{ id: "a1", title: "A preview article", summary: "A short preview", canonicalUrl: "https://preview.example.com/a1", publishedAt: null, thumbnail: null }],
      }),
      "/api/recommendations/follow": () => {
        followCalled = true;
        return { source: {} };
      },
    });

    render(<AddSourceFlow lang="en" categories={categories} initialProfessionKey="tech" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Previewable Source/ }));

    expect(await screen.findByText("A preview article")).toBeInTheDocument();
    expect(screen.getByText("A short preview")).toBeInTheDocument();
    expect(followCalled).toBe(false);
    expect(screen.getByText("Follow")).toBeInTheDocument();
  });
});
