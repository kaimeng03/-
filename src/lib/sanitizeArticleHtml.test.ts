import { describe, it, expect } from "vitest";
import { sanitizeArticleHtml, stripToPlainText } from "./sanitizeArticleHtml";

describe("sanitizeArticleHtml", () => {
  it("removes <script> tags entirely", () => {
    const out = sanitizeArticleHtml('<p>hello</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("hello");
  });

  it("strips on* event handler attributes", () => {
    const out = sanitizeArticleHtml('<img src="x.jpg" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert(1)");
  });

  it("blocks javascript: URLs in links", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("blocks data:text/html URLs", () => {
    const out = sanitizeArticleHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>');
    expect(out.toLowerCase()).not.toContain("data:text/html");
  });

  it("removes iframe/object/embed", () => {
    const out = sanitizeArticleHtml(
      '<iframe src="https://evil.example.com"></iframe><object data="x"></object><embed src="x">',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).not.toContain("<embed");
  });

  it("removes style tags and style attributes", () => {
    const out = sanitizeArticleHtml('<style>body{display:none}</style><p style="color:red">hi</p>');
    expect(out).not.toContain("<style");
    expect(out).not.toContain("style=");
  });

  it("keeps ordinary reading-mode content intact", () => {
    const out = sanitizeArticleHtml(
      '<p>Some <strong>bold</strong> text with <a href="https://example.com">a link</a>.</p><img src="https://example.com/a.jpg" alt="pic">',
    );
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="https://example.com/a.jpg"');
  });
});

describe("stripToPlainText", () => {
  it("removes all markup and scripts", () => {
    const out = stripToPlainText('<p>Hello <script>alert(1)</script><b>world</b></p>');
    expect(out).toBe("Hello world");
  });
});
