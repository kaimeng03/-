/**
 * Unified article shape every connector normalizes into. A field that a
 * provider doesn't supply is `null` / `"unknown"` — never guessed.
 */
export interface NormalizedArticle {
  id: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  source: string;
  authors: string[];
  publishedAt: string | null;
  thumbnail: string | null;
  doi: string | null;
  pmid: string | null;
  language: string | null;
  accessType: "free" | "open_access" | "partial" | "subscription" | "unknown";
  peerReviewed: boolean | null;
  preprint: boolean | null;
  /** Correction/retraction metadata, only when the provider actually supplies it. */
  retracted?: boolean;
  correctionNote?: string | null;
}

/** A candidate source found by a connector's discover() step — not yet a
 *  Source row, just enough to preview and (if confirmed) create one. */
export interface SourceCandidate {
  provider: string;
  connectorType: "rss" | "atom" | "api" | "sitemap" | "html_adapter";
  name: string;
  homepage: string;
  feedUrl?: string | null;
  connectorConfig?: Record<string, unknown>;
  accessType?: NormalizedArticle["accessType"];
  contentType?: "news" | "magazine" | "journal" | "government" | "guideline" | "preprint" | "blog" | "other";
  language?: string | null;
  country?: string | null;
}

export interface ConnectorSourceLike {
  provider: string;
  feedUrl: string | null;
  connectorConfig: unknown;
}
