"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Article, ExtractedContent } from "@/lib/types";
import ArticleReader from "@/components/ArticleReader";
import { formatRelativeTime } from "@/lib/formatTime";

function proxied(url: string | null): string | null {
  if (!url) return null;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export default function NewsApp({ initialArticles }: { initialArticles: Article[] }) {
  const router = useRouter();
  const [articles] = useState(initialArticles);
  const [activeSource, setActiveSource] = useState<string>("all");
  const [selected, setSelected] = useState<Article | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sources = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of articles) map.set(a.sourceId, a.sourceName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [articles]);

  const filtered = useMemo(() => {
    if (activeSource === "all") return articles;
    return articles.filter((a) => a.sourceId === activeSource);
  }, [articles, activeSource]);

  async function openArticle(article: Article) {
    setSelected(article);
    setContent(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/content?url=${encodeURIComponent(article.link)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "讀取失敗");
      setContent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h1 className="text-lg font-semibold tracking-tight">建築新聞</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          {refreshing ? "更新中…" : "重新整理"}
        </button>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-black/10 px-4 py-2 dark:border-white/10">
        <FilterTab label="全部" active={activeSource === "all"} onClick={() => setActiveSource("all")} />
        {sources.map((s) => (
          <FilterTab
            key={s.id}
            label={s.name}
            active={activeSource === s.id}
            onClick={() => setActiveSource(s.id)}
          />
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        <ul
          className={`min-h-0 w-full shrink-0 overflow-y-auto border-r border-black/10 dark:border-white/10 md:w-[400px] ${
            selected ? "hidden md:block" : "block"
          }`}
        >
          {filtered.length === 0 && (
            <li className="p-6 text-center text-sm text-neutral-500">
              目前沒有文章，稍後再試試「重新整理」。
            </li>
          )}
          {filtered.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => openArticle(a)}
                className={`flex w-full gap-3 border-b border-black/5 p-3 text-left transition hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5 ${
                  selected?.id === a.id ? "bg-black/5 dark:bg-white/10" : ""
                }`}
              >
                {a.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxied(a.thumbnail) ?? undefined}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded-md object-cover bg-black/5 dark:bg-white/10"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
                    <span className="font-medium text-neutral-600 dark:text-neutral-400">
                      {a.sourceName}
                    </span>
                    <span>·</span>
                    <span>{formatRelativeTime(a.pubDate)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{a.title}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className={`min-h-0 flex-1 overflow-y-auto ${selected ? "block" : "hidden md:block"}`}>
          <ArticleReader
            article={selected}
            content={content}
            loading={loading}
            error={error}
            onBack={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15"
      }`}
    >
      {label}
    </button>
  );
}
