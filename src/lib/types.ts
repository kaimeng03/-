export interface Article {
  id: string;
  link: string;
  sourceId: string;
  sourceName: string;
  categoryId: string;
  pubDate: string | null;
  thumbnail: string | null;
  titleEn: string;
  titleZh: string;
  summaryEn: string;
  summaryZh: string;
  /** Sanitized full/partial content from the RSS item itself (content:encoded /
   *  content / description), in the original language. Used as a legitimate,
   *  no-scraping fallback when live extraction hits a login wall or challenge.
   *  null when the feed only provided a short summary with nothing beyond that. */
  feedHtmlEn: string | null;
  /** "extract" (default, RSS sources): try live extraction, fall back to feedHtmlEn.
   *  "feed-only" (HTML-adapter sources): the scraped content IS the article; there's
   *  no separate full-article page worth (re-)fetching, so skip extraction entirely. */
  contentMode: "extract" | "feed-only";
}

export type ContentStatus = "full" | "feed-content" | "summary-only" | "unavailable";
export type ContentGateKind = "login-wall" | "challenge" | "too-short" | "client-error";

export interface ExtractedContent {
  status: ContentStatus;
  titleEn: string;
  titleZh: string;
  byline: string | null;
  htmlEn: string | null;
  htmlZh: string | null;
  siteName: string | null;
  /** Set (only for non-"full" statuses) so the client can render a localized notice. */
  gate?: ContentGateKind;
}
