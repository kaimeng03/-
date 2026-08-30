import { fetchTwarchitectNews } from "./twarchitect";
import { fetchGenericHtmlNews } from "./genericHtml";
import type { HtmlAdapterArticle } from "./types";

export type { HtmlAdapterArticle };
export { matchHtmlSourceAdapter, type HtmlAdapterMatch } from "./match";

type AdapterFn = (pageUrl: string) => Promise<HtmlAdapterArticle[]>;

// Deliberately a small explicit registry, not a generic "scrape anything" engine —
// each site's markup is different enough that a shared heuristic parser would be
// fragile. Adding support for another HTML-only site means adding one adapter file
// and one entry here.
const ADAPTERS: Record<string, AdapterFn> = {
  twarchitect: fetchTwarchitectNews,
  generic_html: fetchGenericHtmlNews,
};

export function getHtmlAdapter(name: string | undefined): AdapterFn | null {
  if (!name) return null;
  return ADAPTERS[name] ?? null;
}
