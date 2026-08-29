import sanitizeHtml from "sanitize-html";

// Shared allowlist for any HTML that ends up in dangerouslySetInnerHTML — extracted
// article bodies, RSS content:encoded, and the HTML-adapter output. Readability
// already strips most script/style content, but publisher RSS HTML and arbitrary
// scraped HTML are untrusted input regardless, so this is the actual XSS boundary,
// not a redundant second pass.
const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "img",
  "figure",
  "figcaption",
  "blockquote",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "hr",
  "picture",
  "source",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height"],
  source: ["srcset", "media", "type"],
  "*": ["colspan", "rowspan"],
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    // No iframe/object/embed/script/style/on*-handlers/style attr — all excluded by
    // simply not appearing in ALLOWED_TAGS/ALLOWED_ATTRIBUTES above. sanitize-html
    // strips anything not explicitly allowlisted, including event handler attributes
    // and javascript:/data:text/html URLs regardless of scheme casing or encoding.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  }).trim();
}

/** Strips all markup down to plain text — for summaries/teasers, not full content. */
export function stripToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
