import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useReadState, __resetReadStateForTests } from "./useReadState";

function Harness({ id, onError }: { id: string; onError?: (message: string) => void }) {
  const { isRead, isSaved, markRead, markUnread, toggleSaved, markAllRead } = useReadState(onError);
  return (
    <div>
      <span data-testid="read">{String(isRead(id))}</span>
      <span data-testid="saved">{String(isSaved(id))}</span>
      <button onClick={() => markRead(id)}>mark-read</button>
      <button onClick={() => markUnread(id)}>mark-unread</button>
      <button onClick={() => toggleSaved(id)}>toggle-saved</button>
      <button onClick={() => markAllRead([id])}>mark-all-read</button>
    </div>
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => handler(url, init)),
  );
}

function okJson(body: unknown = { ok: true }): Response {
  return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
  __resetReadStateForTests();
  vi.restoreAllMocks();
});

describe("useReadState — optimistic UI over /api/article-states", () => {
  it("hydrates initial read/saved state from the server on mount", async () => {
    stubFetch(() => okJson({ read: ["a1"], saved: [] }));
    render(<Harness id="a1" />);

    await waitFor(() => expect(screen.getByTestId("read")).toHaveTextContent("true"));
  });

  it("marks an article read optimistically before the network call resolves", async () => {
    stubFetch(() => okJson({ read: [], saved: [] }));
    render(<Harness id="a1" />);
    await waitFor(() => expect(screen.getByTestId("read")).toHaveTextContent("false"));

    act(() => {
      fireEvent.click(screen.getByText("mark-read"));
    });
    expect(screen.getByTestId("read")).toHaveTextContent("true");
  });

  it("marks unread and toggles saved", async () => {
    stubFetch(() => okJson({ read: ["a1"], saved: [] }));
    render(<Harness id="a1" />);
    await waitFor(() => expect(screen.getByTestId("read")).toHaveTextContent("true"));

    fireEvent.click(screen.getByText("mark-unread"));
    expect(screen.getByTestId("read")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("toggle-saved"));
    expect(screen.getByTestId("saved")).toHaveTextContent("true");
    fireEvent.click(screen.getByText("toggle-saved"));
    expect(screen.getByTestId("saved")).toHaveTextContent("false");
  });

  it("rolls back an optimistic markRead and reports an error when the PUT fails", async () => {
    const onError = vi.fn();
    stubFetch((url) => {
      if (url.toString().includes("/api/article-states/")) {
        return { ok: false, json: async () => ({}) } as Response;
      }
      return okJson({ read: [], saved: [] });
    });
    render(<Harness id="a1" onError={onError} />);
    await waitFor(() => expect(screen.getByTestId("read")).toHaveTextContent("false"));

    fireEvent.click(screen.getByText("mark-read"));
    expect(screen.getByTestId("read")).toHaveTextContent("true");

    await waitFor(() => expect(screen.getByTestId("read")).toHaveTextContent("false"));
    expect(onError).toHaveBeenCalled();
  });

  it("marks all as read via the batch endpoint", async () => {
    const putCalls: string[] = [];
    stubFetch((url) => {
      putCalls.push(url.toString());
      if (url.toString().includes("mark-all-read")) return okJson({ ok: true, count: 1 });
      return okJson({ read: [], saved: [] });
    });
    render(<Harness id="a1" />);
    await waitFor(() => expect(screen.getByTestId("read")).toHaveTextContent("false"));

    fireEvent.click(screen.getByText("mark-all-read"));
    expect(screen.getByTestId("read")).toHaveTextContent("true");
    await waitFor(() => expect(putCalls.some((u) => u.includes("mark-all-read"))).toBe(true));
  });

  it("does not crash and starts empty when the initial GET fails", async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }) as Response);
    expect(() => render(<Harness id="a1" />)).not.toThrow();
    expect(screen.getByTestId("read")).toHaveTextContent("false");
  });
});
