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

export const CATEGORIES: Category[] = [{ id: "architecture-news", name: "建築新聞" }];

export const SOURCES: Source[] = [
  {
    id: "archdaily",
    name: "ArchDaily",
    homepage: "https://www.archdaily.com",
    feedUrl: "https://www.archdaily.com/rss/",
    categoryId: "architecture-news",
  },
  {
    id: "dezeen",
    name: "Dezeen",
    homepage: "https://www.dezeen.com",
    feedUrl: "https://www.dezeen.com/feed/",
    categoryId: "architecture-news",
  },
  {
    id: "designboom",
    name: "designboom",
    homepage: "https://www.designboom.com/architecture",
    feedUrl: "https://www.designboom.com/architecture/feed/",
    categoryId: "architecture-news",
  },
  {
    id: "architizer",
    name: "Architizer",
    homepage: "https://architizer.com",
    feedUrl: "https://architizer.com/blog/feed/",
    categoryId: "architecture-news",
  },
  {
    id: "archpaper",
    name: "The Architect's Newspaper",
    homepage: "https://www.archpaper.com",
    feedUrl: "https://www.archpaper.com/feed",
    categoryId: "architecture-news",
  },
];
