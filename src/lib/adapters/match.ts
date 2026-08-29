// Centralized recognition of "this URL belongs to a known HTML adapter" — kept here
// (not scattered across UI/store code) so sourceStore.addSource() has one place to
// ask "is this actually an HTML-adapter source in disguise?" before ever touching
// the generic RSS discovery flow.

export interface HtmlAdapterMatch {
  adapter: string;
  /** Canonical page URL the adapter should scrape. */
  pageUrl: string;
  /** Canonical homepage to store on the Source. */
  homepage: string;
}

type Matcher = (url: URL) => HtmlAdapterMatch | null;

const TWARCHITECT_HOSTS = new Set(["twarchitect.org.tw", "www.twarchitect.org.tw"]);
const TWARCHITECT_CANONICAL_URL = "https://www.twarchitect.org.tw/page_news/";

const matchTwarchitect: Matcher = (url) => {
  if (!TWARCHITECT_HOSTS.has(url.hostname.toLowerCase())) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/page_news") return null;
  return {
    adapter: "twarchitect",
    pageUrl: TWARCHITECT_CANONICAL_URL,
    homepage: TWARCHITECT_CANONICAL_URL,
  };
};

const MATCHERS: Matcher[] = [matchTwarchitect];

/**
 * Pure function: given whatever URL the user typed into "Add website" (any
 * scheme/host-casing/trailing-slash/query/hash variant), returns the HTML adapter
 * it belongs to, or null if it isn't a recognized HTML-adapter source (in which
 * case the caller should fall through to normal RSS discovery).
 */
export function matchHtmlSourceAdapter(inputUrl: string): HtmlAdapterMatch | null {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  for (const matcher of MATCHERS) {
    const match = matcher(url);
    if (match) return match;
  }
  return null;
}
