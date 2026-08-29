export interface Category {
  id: string;
  name: string;
}

export interface Source {
  id: string;
  name: string;
  homepage: string;
  feedUrl: string;
  categoryId: string;
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
