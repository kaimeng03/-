// Sitemap "preview" connector. A sitemap is never treated as a live news feed
// on its own — it can only be previewed (a bounded sample of <loc> entries)
// so the user can confirm before anything is created.
import { safeFetchText, UnsafeUrlError } from "@/lib/safeFetch";
import { parseSitemapLocs } from "./htmlLinks";
import { ConnectorError } from "./errors";

const TIMEOUT_MS = 10000;
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
const PREVIEW_SAMPLE_SIZE = 20;

export interface SitemapPreview {
  totalUrls: number;
  sampleUrls: string[];
  isSitemapIndex: boolean;
}

export async function previewSitemap(sitemapUrl: string): Promise<SitemapPreview> {
  let text: string;
  try {
    const result = await safeFetchText(sitemapUrl, {
      timeoutMs: TIMEOUT_MS,
      headers: { Accept: "application/xml, text/xml" },
      maxBytes: MAX_SITEMAP_BYTES,
    });
    if (!result.response.ok) {
      throw new ConnectorError("PROVIDER_UNAVAILABLE", `Sitemap fetch failed: HTTP ${result.response.status}`);
    }
    text = result.text;
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    if (err instanceof UnsafeUrlError) throw new ConnectorError("UNSAFE_URL", err.message);
    throw new ConnectorError("FETCH_TIMEOUT", "Sitemap request failed or timed out");
  }

  const locs = parseSitemapLocs(text);
  if (locs.length === 0) {
    throw new ConnectorError("INVALID_FEED", "No <loc> entries found in this sitemap");
  }

  const isSitemapIndex = /<sitemapindex[\s>]/i.test(text.slice(0, 500));
  return {
    totalUrls: locs.length,
    sampleUrls: locs.slice(0, PREVIEW_SAMPLE_SIZE),
    isSitemapIndex,
  };
}

export function looksLikeSitemapUrl(url: string): boolean {
  return /sitemap.*\.xml(\.gz)?$/i.test(url) || /\/sitemap[_-]?index\.xml$/i.test(url);
}
