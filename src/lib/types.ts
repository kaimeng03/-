export interface Article {
  id: string;
  title: string;
  link: string;
  sourceId: string;
  sourceName: string;
  pubDate: string | null;
  summary: string;
  thumbnail: string | null;
}

export interface ExtractedContent {
  title: string;
  byline: string | null;
  html: string;
  siteName: string | null;
}
