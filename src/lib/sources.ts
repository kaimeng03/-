export interface Category {
  id: string;
  name: string;
}

export interface Source {
  id: string;
  name: string;
  homepage: string;
  /** For type "html" sources this is unused for fetching (kept for display/back-compat). */
  feedUrl: string;
  categoryId: string;
  /** Missing/undefined means "rss" — existing sources.json files don't need migrating.
   *  "api" means an API-provider source (Europe PMC/PubMed/Crossref) that isn't
   *  wired into the scheduled RSS-style refresh cycle yet — see src/lib/feeds.ts. */
  type?: "rss" | "html" | "api";
  /** The page an "html" adapter scrapes. Required when type is "html". */
  pageUrl?: string;
  /** Which adapter (see src/lib/adapters) handles this source when type is "html". */
  adapter?: string;
  /** Set when type is "api" — which connector (europepmc/pubmed/crossref) and
   *  its public, non-secret query config (e.g. { query } or { term } or { issn }).
   *  Never contains an API key or any server secret. */
  provider?: string;
  connectorConfig?: Record<string, unknown> | null;
}

export interface SourcesConfig {
  categories: Category[];
  sources: Source[];
}

// Used only if data/sources.json can't be read and there's no GitHub-backed store configured.
export const FALLBACK_CONFIG: SourcesConfig = {
  categories: [{ id: "architecture-news", name: "建築新聞" }],
  sources: [
    {
      id: "archdaily",
      name: "ArchDaily",
      homepage: "https://www.archdaily.com",
      feedUrl: "https://www.archdaily.com/rss/",
      categoryId: "architecture-news",
    },
  ],
};
