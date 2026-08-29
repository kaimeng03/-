"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Article, ExtractedContent } from "@/lib/types";
import type { Category, Source } from "@/lib/sources";
import ArticleReader from "@/components/ArticleReader";
import { formatRelativeTime } from "@/lib/formatTime";

type Filter = { type: "all" } | { type: "category"; id: string } | { type: "source"; id: string };
type Lang = "zh" | "en";

function proxied(url: string | null): string | null {
  if (!url) return null;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export default function NewsApp({
  initialArticles,
  categories,
  sources,
}: {
  initialArticles: Article[];
  categories: Category[];
  sources: Source[];
}) {
  const router = useRouter();
  const articles = initialArticles;
  const [lang, setLang] = useState<Lang>("zh");
  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSource, setAddingSource] = useState(false);

  const filtered = useMemo(() => {
    if (filter.type === "all") return articles;
    if (filter.type === "category") return articles.filter((a) => a.categoryId === filter.id);
    return articles.filter((a) => a.sourceId === filter.id);
  }, [articles, filter]);

  function selectFilter(f: Filter) {
    setFilter(f);
    setSidebarOpen(false);
  }

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
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      // ignore, router.refresh() below still re-renders with whatever is cached
    }
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md border border-black/10 px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-black/5 md:hidden dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
            aria-label="開啟分類選單"
          >
            ☰
          </button>
          <h1 className="text-lg font-semibold tracking-tight">建築新聞</h1>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle lang={lang} onChange={setLang} />
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {refreshing ? "更新中…" : "重新整理"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            sidebarOpen ? "fixed inset-0 z-20 block" : "hidden"
          } overflow-y-auto bg-white p-3 dark:bg-neutral-950 md:static md:z-auto md:block md:w-64 md:shrink-0 md:border-r md:border-black/10 dark:md:border-white/10`}
        >
          <div className="mb-2 flex items-center justify-between md:hidden">
            <span className="text-sm font-medium text-neutral-500">分類</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="關閉分類選單"
            >
              ✕
            </button>
          </div>

          <button
            onClick={() => setAddingSource((v) => !v)}
            className="mb-3 w-full rounded-md border border-dashed border-black/20 px-2 py-1.5 text-left text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            ＋ 新增網站
          </button>
          {addingSource && (
            <AddSourceForm
              categories={categories}
              onDone={() => {
                setAddingSource(false);
                router.refresh();
              }}
              onCancel={() => setAddingSource(false)}
            />
          )}

          <SidebarButton
            label="全部文章"
            active={filter.type === "all"}
            onClick={() => selectFilter({ type: "all" })}
          />

          <div className="mt-3 space-y-3">
            {categories.map((cat) => {
              const catSources = sources.filter((s) => s.categoryId === cat.id);
              return (
                <div key={cat.id}>
                  <button
                    onClick={() => selectFilter({ type: "category", id: cat.id })}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-semibold transition ${
                      filter.type === "category" && filter.id === cat.id
                        ? "bg-black/5 dark:bg-white/10"
                        : "text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
                    }`}
                  >
                    📁 {cat.name}
                  </button>
                  <div className="ml-3 mt-0.5 border-l border-black/10 pl-2 dark:border-white/10">
                    {catSources.map((s) => (
                      <SidebarButton
                        key={s.id}
                        label={s.name}
                        active={filter.type === "source" && filter.id === s.id}
                        onClick={() => selectFilter({ type: "source", id: s.id })}
                        compact
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            <div>
              {addingCategory ? (
                <AddCategoryForm
                  onDone={() => {
                    setAddingCategory(false);
                    router.refresh();
                  }}
                  onCancel={() => setAddingCategory(false)}
                />
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-neutral-500 transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ＋ 新增分類
                </button>
              )}
            </div>
          </div>
        </aside>

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
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {lang === "zh" ? a.titleZh : a.titleEn}
                  </p>
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
            lang={lang}
            onBack={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-black/10 text-sm dark:border-white/15">
      <button
        onClick={() => onChange("zh")}
        className={`px-2.5 py-1.5 transition ${
          lang === "zh"
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        }`}
      >
        繁中
      </button>
      <button
        onClick={() => onChange("en")}
        className={`px-2.5 py-1.5 transition ${
          lang === "en"
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        }`}
      >
        EN
      </button>
    </div>
  );
}

function SidebarButton({
  label,
  active,
  onClick,
  compact,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-md px-2 text-left transition ${compact ? "py-1 text-sm" : "py-1.5 text-sm font-semibold"} ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function AddCategoryForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-black/10 p-2 dark:border-white/15">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="分類名稱，例如：室內設計"
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "新增中…" : "新增"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
        >
          取消
        </button>
      </div>
    </form>
  );
}

function AddSourceForm({
  categories,
  onDone,
  onCancel,
}: {
  categories: Category[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, feedUrl, categoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setSubmitting(false);
    }
  }

  if (categories.length === 0) {
    return (
      <p className="mb-3 text-xs text-neutral-500">請先新增一個分類，才能加入網站。</p>
    );
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded-md border border-black/10 p-2 dark:border-white/15">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="網站名稱"
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
      />
      <input
        value={feedUrl}
        onChange={(e) => setFeedUrl(e.target.value)}
        placeholder="RSS 網址 (https://...)"
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id} className="text-black">
            {c.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !name.trim() || !feedUrl.trim()}
          className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "驗證並新增中…" : "新增"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
        >
          取消
        </button>
      </div>
    </form>
  );
}
