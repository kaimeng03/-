import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useLang, __resetLangStoreForTests } from "./useLang";

function Harness() {
  const [lang, setLang] = useLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang("zh")}>zh</button>
      <button onClick={() => setLang("en")}>en</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetLangStoreForTests();
});

describe("useLang", () => {
  it("toggles repeatedly, not just once", () => {
    render(<Harness />);
    const zhBtn = screen.getByRole("button", { name: "zh" });
    const enBtn = screen.getByRole("button", { name: "en" });

    expect(screen.getByTestId("lang")).toHaveTextContent("zh");

    for (let i = 0; i < 10; i++) {
      fireEvent.click(enBtn);
      expect(screen.getByTestId("lang")).toHaveTextContent("en");
      fireEvent.click(zhBtn);
      expect(screen.getByTestId("lang")).toHaveTextContent("zh");
    }
  });

  it("persists the chosen language to localStorage", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("en"));
    expect(localStorage.getItem("lang")).toBe("en");
  });

  it("syncs across two hook instances in the same tab (simulating a second component)", () => {
    function TwoHarnesses() {
      const [langA, setLangA] = useLang();
      const [langB] = useLang();
      return (
        <div>
          <span data-testid="a">{langA}</span>
          <span data-testid="b">{langB}</span>
          <button onClick={() => setLangA("en")}>set-en</button>
        </div>
      );
    }
    render(<TwoHarnesses />);
    fireEvent.click(screen.getByText("set-en"));
    expect(screen.getByTestId("a")).toHaveTextContent("en");
    expect(screen.getByTestId("b")).toHaveTextContent("en");
  });

  it("syncs across tabs via the storage event", () => {
    render(<Harness />);
    expect(screen.getByTestId("lang")).toHaveTextContent("zh");

    act(() => {
      localStorage.setItem("lang", "en");
      window.dispatchEvent(new StorageEvent("storage", { key: "lang", newValue: "en" }));
    });

    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });

  it("does not get stuck when localStorage throws (e.g. blocked storage)", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<Harness />);
      expect(() => fireEvent.click(screen.getByRole("button", { name: "en" }))).not.toThrow();
      expect(screen.getByTestId("lang")).toHaveTextContent("en");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
