export interface HtmlAdapterArticle {
  id: string;
  link: string;
  title: string;
  pubDate: string | null;
  summary: string;
  thumbnail: string | null;
  /** Sanitized full/partial body HTML, already proxy-rewritten for images. */
  htmlEn: string;
  /** `extract` when `link` is a real article page that can be safely fetched.
   *  Omit (or use `feed-only`) only when the adapter already returned the full
   *  item or when every item points back to one shared listing page. */
  contentMode?: "extract" | "feed-only";
}
