export interface Source {
  id: string;
  name: string;
  homepage: string;
  feedUrl: string;
}

export const SOURCES: Source[] = [
  {
    id: "archdaily",
    name: "ArchDaily",
    homepage: "https://www.archdaily.com",
    feedUrl: "https://www.archdaily.com/rss/",
  },
  {
    id: "dezeen",
    name: "Dezeen",
    homepage: "https://www.dezeen.com",
    feedUrl: "https://www.dezeen.com/feed/",
  },
  {
    id: "designboom",
    name: "designboom",
    homepage: "https://www.designboom.com/architecture",
    feedUrl: "https://www.designboom.com/architecture/feed/",
  },
  {
    id: "architizer",
    name: "Architizer",
    homepage: "https://architizer.com",
    feedUrl: "https://architizer.com/blog/feed/",
  },
  {
    id: "archpaper",
    name: "The Architect's Newspaper",
    homepage: "https://www.archpaper.com",
    feedUrl: "https://www.archpaper.com/feed",
  },
];
