"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Article, ExtractedContent } from "@/lib/types";
import type { Category, Source } from "@/lib/sources";
import ArticleReader from "@/components/ArticleReader";
import { formatRelativeTime } from "@/lib/formatTime";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/useLang";

type Filter = { type: "all" } | { type: "category"; id: string } | { type: "source"; id: string };

const REFRESH_TIMEOUT_MS = 15000;
const REFRESHED_FLASH_MS = 2500;

function proxied(url: string | null): string | null {
  if (!url) return null;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export default function NewsApp({
  initialArticles,
  categories,
  sources,
  failedSourceNames,
  lastUpdated,
}: {
  initialArticles: Article[];
  categories: Category[];
  sources: Source[];
  failedSourceNames: string[];
  lastUpdated: string;
}) {
  const router = useRouter();
  const articles = initialArticles;
  const [lang, setLang] = useLang();
  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const seenUpdatedAt = useRef(lastUpdated);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSource, setAddingSource] = useState(false);

  // The click handler can't await router.refresh() (it returns void), so instead
  // we watch for the `lastUpdated` prop to actually change — that only happens once
  // page.tsx has genuinely re-run fetchAllArticles(), which is the real signal that
  // the refresh completed (not just that some time passed).
  useEffect(() => {
    if (refreshing && lastUpdated !== seenUpdatedAt.current) {
      seenUpdatedAt.current = lastUpdated;
      setRefreshing(false);
      setJustRefreshed(true);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      const flashTimer = setTimeout(() => setJustRefreshed(false), REFRESHED_FLASH_MS);
      return () => clearTimeout(flashTimer);
    }
    seenUpdatedAt.current = lastUpdated;
  }, [lastUpdated, refreshing]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

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
    if (refreshing) return;
    setRefreshing(true);
    setJustRefreshed(false);

    // Safety net: if the expected re-render never arrives (offline, server error),
    // don't leave the button stuck showing "refreshing" forever.
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), REFRESH_TIMEOUT_MS);

    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      // Even if this call fails, still ask the router to re-render — worst case
      // it serves the still-cached data and the timeout above clears the spinner.
    }
    router.refresh();
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md border border-black/10 px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-black/5 md:hidden dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
            aria-label={t(lang, "openMenu")}
          >
            ☰
          </button>
          <h1 className="text-lg font-semibold tracking-tight">{t(lang, "appTitle")}</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* toLocaleTimeString is timezone-dependent, so the server render (e.g. UTC on
              Vercel) and the browser's render can legitimately print different text.
              suppressHydrationWarning is React's documented mechanism for exactly this
              case — a real client/server difference, not a bug to paper over. */}
          <span className="hidden text-xs text-neutral-400 sm:inline" suppressHydrationWarning>
            {t(lang, "lastUpdated", {
              time: new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            })}
          </span>
          <LangToggle lang={lang} onChange={setLang} />
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {refreshing ? t(lang, "refreshing") : justRefreshed ? t(lang, "refreshed") : t(lang, "refresh")}
          </button>
        </div>
      </header>

      {failedSourceNames.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t(lang, "sourcesFailedNotice", { names: failedSourceNames.join("、") })}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            sidebarOpen ? "fixed inset-0 z-20 block" : "hidden"
          } overflow-y-auto bg-white p-3 dark:bg-neutral-950 md:static md:z-auto md:block md:w-64 md:shrink-0 md:border-r md:border-black/10 dark:md:border-white/10`}
        >
          <div className="mb-2 flex items-center justify-between md:hidden">
            <span className="text-sm font-medium text-neutral-500">{t(lang, "categoriesLabel")}</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={t(lang, "closeMenu")}
            >
              ✕
            </button>
          </div>

          <button
            onClick={() => setAddingSource((v) => !v)}
            className="mb-3 w-full rounded-md border border-dashed border-black/20 px-2 py-1.5 text-left text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {t(lang, "addWebsite")}
          </button>
          {addingSource && (
            <AddSourceForm
              lang={lang}
              categories={categories}
              onDone={() => {
                setAddingSource(false);
                router.refresh();
              }}
              onCancel={() => setAddingSource(false)}
            />
          )}

          <SidebarButton
            label={t(lang, "allArticles")}
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
                  lang={lang}
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
                  {t(lang, "addCategory")}
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
            <li className="p-6 text-center text-sm text-neutral-500">{t(lang, "noArticles")}</li>
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
                  <Image
                    src={proxied(a.thumbnail) ?? ""}
                    alt=""
                    width={80}
                    height={64}
                    unoptimized
                    className="h-16 w-20 shrink-0 rounded-md object-cover bg-black/5 dark:bg-white/10"
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

function LangToggle({ lang, onChange }: { lang: "zh" | "en"; onChange: (l: "zh" | "en") => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-black/10 text-sm dark:border-white/15">
      <button
        onClick={() => onChange("zh")}
        aria-pressed={lang === "zh"}
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
        aria-pressed={lang === "en"}
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

function AddCategoryForm({
  lang,
  onDone,
  onCancel,
}: {
  lang: "zh" | "en";
  onDone: () => void;
  onCancel: () => void;
}) {
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
      if (!res.ok) throw new Error(data.error || t(lang, "genericAddCategoryError"));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "genericAddCategoryError"));
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
        placeholder={t(lang, "categoryNamePlaceholder")}
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? t(lang, "adding") : t(lang, "add")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
        >
          {t(lang, "cancel")}
        </button>
      </div>
    </form>
  );
}

function AddSourceForm({
  lang,
  categories,
  onDone,
  onCancel,
}: {
  lang: "zh" | "en";
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
      if (!res.ok) throw new Error(data.error || t(lang, "genericAddSourceError"));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "genericAddSourceError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (categories.length === 0) {
    return <p className="mb-3 text-xs text-neutral-500">{t(lang, "needCategoryFirst")}</p>;
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded-md border border-black/10 p-2 dark:border-white/15">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(lang, "websiteNamePlaceholder")}
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
      />
      <input
        value={feedUrl}
        onChange={(e) => setFeedUrl(e.target.value)}
        placeholder={t(lang, "feedUrlPlaceholder")}
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
          {submitting ? t(lang, "addingSource") : t(lang, "add")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
        >
          {t(lang, "cancel")}
        </button>
      </div>
    </form>
  );
}
