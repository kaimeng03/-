export interface HtmlAdapterArticle {
  id: string;
  link: string;
  title: string;
  pubDate: string | null;
  summary: string;
  thumbnail: string | null;
  /** Sanitized full/partial body HTML, already proxy-rewritten for images. */
  htmlEn: string;
}
