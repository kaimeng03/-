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
}

export interface ExtractedContent {
  titleEn: string;
  titleZh: string;
  byline: string | null;
  htmlEn: string;
  htmlZh: string;
  siteName: string | null;
}
