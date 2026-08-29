import { describe, it, expect } from "vitest";
import { detectContentGate } from "./contentGate";

describe("detectContentGate", () => {
  it("recognizes a normal, fully-extracted article as ok", () => {
    const result = detectContentGate({
      status: 200,
      rawHtmlSample: "<html><head><title>Some House / Some Architects</title></head><body>...</body></html>",
      readabilityTitle: "Some House / Some Architects",
      readabilityTextLength: 4200,
    });
    expect(result).toBe("ok");
  });

  it("flags an HTTP 401/403 response as a login wall", () => {
    expect(
      detectContentGate({
        status: 403,
        rawHtmlSample: "",
        readabilityTitle: null,
        readabilityTextLength: 0,
      }),
    ).toBe("login-wall");
  });

  it("flags a Cloudflare 'Just a moment...' challenge page", () => {
    const fixture = `<!doctype html><html><head><title>Just a moment...</title></head>
      <body class="no-js"><div id="challenge-running"></div>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
      </body></html>`;
    const result = detectContentGate({
      status: 200,
      rawHtmlSample: fixture,
      readabilityTitle: "Just a moment...",
      readabilityTextLength: 12,
    });
    expect(result).toBe("challenge");
  });

  it("flags a typical login-wall page by its title and password field", () => {
    const fixture = `<!doctype html><html><body>
      <form action="/login" method="post">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <button>Sign In</button>
      </form>
      </body></html>`;
    const result = detectContentGate({
      status: 200,
      rawHtmlSample: fixture,
      readabilityTitle: "Sign In",
      readabilityTextLength: 40,
    });
    expect(result).toBe("login-wall");
  });

  it("flags a subscribe-to-continue paywall by title", () => {
    const result = detectContentGate({
      status: 200,
      rawHtmlSample: "<html></html>",
      readabilityTitle: "Subscribe to continue reading",
      readabilityTextLength: 80,
    });
    expect(result).toBe("login-wall");
  });

  it("flags suspiciously short extracted content even with an innocuous title", () => {
    const result = detectContentGate({
      status: 200,
      rawHtmlSample: "<html></html>",
      readabilityTitle: "Some House / Some Architects",
      readabilityTextLength: 50,
    });
    expect(result).toBe("too-short");
  });

  it("does not false-positive on an article whose page merely contains a nav 'Sign in' link", () => {
    // This is the exact failure mode the user warned about: don't mistake a header
    // "Sign in" link or footer "Subscribe to our newsletter" widget for a gate.
    const fixture = `<html><body><nav><a href="/login">Sign in</a> <a href="/newsletter">Subscribe</a></nav>
      <article>${"Real article content. ".repeat(50)}</article></body></html>`;
    const result = detectContentGate({
      status: 200,
      rawHtmlSample: fixture,
      readabilityTitle: "A Real House / A Real Architect",
      readabilityTextLength: 1200,
    });
    expect(result).toBe("ok");
  });
});
