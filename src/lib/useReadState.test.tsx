import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useReadState, __resetReadStateForTests } from "./useReadState";

function Harness({ id }: { id: string }) {
  const { isRead, isSaved, markRead, markUnread, toggleSaved } = useReadState();
  return (
    <div>
      <span data-testid="read">{String(isRead(id))}</span>
      <span data-testid="saved">{String(isSaved(id))}</span>
      <button onClick={() => markRead(id)}>mark-read</button>
      <button onClick={() => markUnread(id)}>mark-unread</button>
      <button onClick={() => toggleSaved(id)}>toggle-saved</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetReadStateForTests();
});

describe("useReadState", () => {
  it("marks an article read and unread", () => {
    render(<Harness id="a1" />);
    expect(screen.getByTestId("read")).toHaveTextContent("false");
    fireEvent.click(screen.getByText("mark-read"));
    expect(screen.getByTestId("read")).toHaveTextContent("true");
    fireEvent.click(screen.getByText("mark-unread"));
    expect(screen.getByTestId("read")).toHaveTextContent("false");
  });

  it("toggles saved state", () => {
    render(<Harness id="a1" />);
    fireEvent.click(screen.getByText("toggle-saved"));
    expect(screen.getByTestId("saved")).toHaveTextContent("true");
    fireEvent.click(screen.getByText("toggle-saved"));
    expect(screen.getByTestId("saved")).toHaveTextContent("false");
  });

  it("persists read state to localStorage under a versioned key", () => {
    render(<Harness id="a1" />);
    fireEvent.click(screen.getByText("mark-read"));
    const raw = localStorage.getItem("readState.v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(parsed.read).toContain("a1");
  });

  it("ignores a corrupt/unversioned stored value instead of crashing", () => {
    localStorage.setItem("readState.v1", "not json");
    expect(() => render(<Harness id="a1" />)).not.toThrow();
    expect(screen.getByTestId("read")).toHaveTextContent("false");
  });
});
