"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Article, ExtractedContent } from "@/lib/types";
import type { Category, Source } from "@/lib/sources";
import ArticleReader from "@/components/ArticleReader";
import { formatRelativeTime } from "@/lib/formatTime";
import { t, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/useLang";
import { useReadState } from "@/lib/useReadState";
import { useAdminSession } from "@/lib/useAdminSession";

type Filter = { type: "all" } | { type: "category"; id: string } | { type: "source"; id: string };
type View = "all" | "today" | "unread" | "saved";

const REFRESH_TIMEOUT_MS = 15000;
const REFRESHED_FLASH_MS = 2500;

function proxied(url: string | null): string | null {
  if (!url) return null;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function isToday(pubDate: string | null): boolean {
  if (!pubDate) return false;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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
  const readState = useReadState();
  const admin = useAdminSession();

  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const [loading, setLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const seenUpdatedAt = useRef(lastUpdated);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  }, [lang]);

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

  const scoped = useMemo(() => {
    if (filter.type === "all") return articles;
    if (filter.type === "category") return articles.filter((a) => a.categoryId === filter.id);
    return articles.filter((a) => a.sourceId === filter.id);
  }, [articles, filter]);

  const filtered = useMemo(() => {
    let list = scoped;
    if (view === "today") list = list.filter((a) => isToday(a.pubDate));
    if (view === "unread") list = list.filter((a) => !readState.isRead(a.id));
    if (view === "saved") list = list.filter((a) => readState.isSaved(a.id));

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const title = (lang === "zh" ? a.titleZh : a.titleEn).toLowerCase();
        const summary = (lang === "zh" ? a.summaryZh : a.summaryEn).toLowerCase();
        return title.includes(q) || summary.includes(q) || a.sourceName.toLowerCase().includes(q);
      });
    }
    return list;
  }, [scoped, view, query, lang, readState]);

  const unreadCountFor = (predicate: (a: Article) => boolean) =>
    articles.filter((a) => predicate(a) && !readState.isRead(a.id)).length;

  function selectFilter(f: Filter) {
    setFilter(f);
    setSidebarOpen(false);
  }

  async function openArticle(article: Article) {
    setSelected(article);
    setContent(null);
    setLoading(true);
    readState.markRead(article.id);
    try {
      if (article.contentMode === "feed-only") {
        // HTML-adapter sources (e.g. twarchitect): the scraped content already IS
        // the article. There's no separate full-article page worth fetching, so
        // this renders straight from what fetchAllArticles() already gathered
        // instead of attempting (and failing) live extraction against a listing page.
        setContent({
          status: article.feedHtmlEn ? "feed-content" : "summary-only",
          titleEn: article.titleEn,
          titleZh: article.titleZh,
          byline: null,
          htmlEn: article.feedHtmlEn,
          htmlZh: article.feedHtmlEn, // translated server-side below if needed
          siteName: null,
        });
        if (article.feedHtmlEn) {
          const res = await fetch("/api/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: article.link,
              feedHtmlEn: article.feedHtmlEn,
              titleEn: article.titleEn,
              titleZh: article.titleZh,
              feedOnly: true,
            }),
          });
          setContent(await res.json());
        }
        return;
      }

      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article.link,
          feedHtmlEn: article.feedHtmlEn,
          titleEn: article.titleEn,
          titleZh: article.titleZh,
        }),
      });
      setContent(await res.json());
    } catch {
      setContent({
        status: "unavailable",
        titleEn: article.titleEn,
        titleZh: article.titleZh,
        byline: null,
        htmlEn: null,
        htmlZh: null,
        siteName: null,
        gate: "client-error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setJustRefreshed(false);
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), REFRESH_TIMEOUT_MS);
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      // still ask for a re-render below; the timeout above clears the spinner if nothing comes back
    }
    router.refresh();
  }

  async function handleRemoveSource(source: Source) {
    if (!confirm(t(lang, "confirmRemoveSource", { name: source.name }))) return;
    const res = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t(lang, "deleteFailed"));
      return;
    }
    if (filter.type === "source" && filter.id === source.id) setFilter({ type: "all" });
    if (selected && selected.sourceId === source.id) {
      setSelected(null);
      setContent(null);
    }
    router.refresh();
  }

  async function handleRemoveCategory(category: Category) {
    const count = sources.filter((s) => s.categoryId === category.id).length;
    const message =
      count > 0
        ? t(lang, "confirmRemoveCategoryNonEmpty", { name: category.name, count: String(count) })
        : t(lang, "confirmRemoveCategoryEmpty", { name: category.name });
    if (!confirm(message)) return;

    const res = await fetch(`/api/categories/${encodeURIComponent(category.id)}?force=true`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t(lang, "deleteFailed"));
      return;
    }
    if (filter.type === "category" && filter.id === category.id) setFilter({ type: "all" });
    if (selected && selected.categoryId === category.id) {
      setSelected(null);
      setContent(null);
    }
    router.refresh();
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
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
          <span className="hidden text-xs text-neutral-400 sm:inline" suppressHydrationWarning>
            {t(lang, "lastUpdated", {
              time: new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            })}
          </span>
          <LangToggle lang={lang} onChange={setLang} />
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-pressed={refreshing}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
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

      <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-2 dark:border-white/10">
        {(["all", "today", "unread", "saved"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 ${
              view === v
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15"
            }`}
          >
            {t(lang, v === "all" ? "filterAll" : v === "today" ? "filterToday" : v === "unread" ? "filterUnread" : "filterSaved")}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(lang, "searchPlaceholder")}
          className="ml-auto w-full max-w-xs rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
        />
        {view === "unread" && filtered.length > 0 && (
          <button
            type="button"
            onClick={() => readState.markAllRead(filtered.map((a) => a.id))}
            className="whitespace-nowrap text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {t(lang, "markAllRead")}
          </button>
        )}
      </div>

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

          {admin.isAdmin && (
            <>
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
            </>
          )}

          <SidebarButton
            label={t(lang, "allArticles")}
            active={filter.type === "all"}
            onClick={() => selectFilter({ type: "all" })}
          />

          <div className="mt-3 space-y-3">
            {categories.map((cat) => {
              const catSources = sources.filter((s) => s.categoryId === cat.id);
              const catUnread = unreadCountFor((a) => a.categoryId === cat.id);
              return (
                <div key={cat.id}>
                  <div className="group flex items-center">
                    <button
                      onClick={() => selectFilter({ type: "category", id: cat.id })}
                      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm font-semibold transition ${
                        filter.type === "category" && filter.id === cat.id
                          ? "bg-black/5 dark:bg-white/10"
                          : "text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
                      }`}
                    >
                      <span className="truncate">📁 {cat.name}</span>
                      {catUnread > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-neutral-400">{catUnread}</span>
                      )}
                    </button>
                    {admin.isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCategory(cat);
                        }}
                        aria-label={t(lang, "removeCategoryLabel", { name: cat.name })}
                        className="ml-1 shrink-0 rounded px-1.5 py-1 text-xs text-neutral-400 opacity-0 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 group-hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="ml-3 mt-0.5 border-l border-black/10 pl-2 dark:border-white/10">
                    {catSources.map((s) => {
                      const srcUnread = unreadCountFor((a) => a.sourceId === s.id);
                      return (
                        <div key={s.id} className="group flex items-center">
                          <SidebarButton
                            label={s.name}
                            badge={srcUnread > 0 ? srcUnread : undefined}
                            active={filter.type === "source" && filter.id === s.id}
                            onClick={() => selectFilter({ type: "source", id: s.id })}
                            compact
                          />
                          {admin.isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSource(s);
                              }}
                              aria-label={t(lang, "removeSourceLabel", { name: s.name })}
                              className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-xs text-neutral-400 opacity-0 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 group-hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {admin.isAdmin && (
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
            )}
          </div>

          <div className="mt-6 border-t border-black/10 pt-3 dark:border-white/10">
            {admin.checked && admin.configured && (
              <AdminLoginArea
                lang={lang}
                isAdmin={admin.isAdmin}
                showForm={showAdminLogin}
                onShowForm={setShowAdminLogin}
                onLogin={admin.login}
                onLogout={admin.logout}
              />
            )}
          </div>
        </aside>

        <ul
          className={`min-h-0 w-full shrink-0 overflow-y-auto border-r border-black/10 dark:border-white/10 md:w-[400px] ${
            selected ? "hidden md:block" : "block"
          }`}
        >
          {filtered.length === 0 && (
            <li className="p-6 text-center text-sm text-neutral-500">
              {articles.length === 0 ? t(lang, "noArticles") : t(lang, "noArticlesFiltered")}
            </li>
          )}
          {filtered.map((a) => {
            const read = readState.isRead(a.id);
            const saved = readState.isSaved(a.id);
            return (
              <li key={a.id}>
                <div
                  className={`flex w-full gap-3 border-b border-black/5 p-3 text-left transition hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5 ${
                    selected?.id === a.id ? "bg-black/5 dark:bg-white/10" : ""
                  }`}
                >
                  <button onClick={() => openArticle(a)} className="flex min-w-0 flex-1 gap-3 text-left">
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
                        <span>{formatRelativeTime(a.pubDate, lang)}</span>
                        {saved && <span aria-hidden>★</span>}
                      </div>
                      <p
                        className={`line-clamp-2 text-sm leading-snug ${
                          read ? "font-normal text-neutral-500 dark:text-neutral-400" : "font-medium"
                        }`}
                      >
                        {lang === "zh" ? a.titleZh : a.titleEn}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => readState.toggleSaved(a.id)}
                    aria-label={t(lang, saved ? "unsaveArticle" : "saveArticle")}
                    aria-pressed={saved}
                    className="shrink-0 self-start rounded px-1 py-1 text-base text-neutral-400 hover:text-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500"
                  >
                    {saved ? "★" : "☆"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className={`min-h-0 flex-1 overflow-y-auto ${selected ? "block" : "hidden md:block"}`}>
          <ArticleReader
            article={selected}
            content={content}
            loading={loading}
            lang={lang}
            isRead={selected ? readState.isRead(selected.id) : false}
            isSaved={selected ? readState.isSaved(selected.id) : false}
            onToggleRead={() => selected && (readState.isRead(selected.id) ? readState.markUnread(selected.id) : readState.markRead(selected.id))}
            onToggleSaved={() => selected && readState.toggleSaved(selected.id)}
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
        type="button"
        onClick={() => onChange("zh")}
        aria-pressed={lang === "zh"}
        className={`px-2.5 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 ${
          lang === "zh"
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        }`}
      >
        繁中
      </button>
      <button
        type="button"
        onClick={() => onChange("en")}
        aria-pressed={lang === "en"}
        className={`px-2.5 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 ${
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
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 flex-1 rounded-md px-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 ${compact ? "py-1 text-sm" : "py-1.5 text-sm font-semibold"} ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
      }`}
    >
      <span className="truncate">{label}</span>
      {badge !== undefined && <span className="ml-1.5 text-xs opacity-70">{badge}</span>}
    </button>
  );
}

function AdminLoginArea({
  lang,
  isAdmin,
  showForm,
  onShowForm,
  onLogin,
  onLogout,
}: {
  lang: Lang;
  isAdmin: boolean;
  showForm: boolean;
  onShowForm: (v: boolean) => void;
  onLogin: (password: string) => Promise<string | null>;
  onLogout: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAdmin) {
    return (
      <button
        type="button"
        onClick={() => onLogout()}
        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
      >
        {t(lang, "adminLogoutButton")}
      </button>
    );
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => onShowForm(true)}
        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
      >
        {t(lang, "adminLoginButton")}
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await onLogin(password);
    setSubmitting(false);
    if (err) {
      setError(t(lang, "adminLoginError"));
    } else {
      onShowForm(false);
      setPassword("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t(lang, "adminPasswordPlaceholder")}
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !password}
          className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {t(lang, "adminLoginSubmit")}
        </button>
        <button
          type="button"
          onClick={() => onShowForm(false)}
          className="flex-1 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
        >
          {t(lang, "cancel")}
        </button>
      </div>
    </form>
  );
}

function AddCategoryForm({
  lang,
  onDone,
  onCancel,
}: {
  lang: Lang;
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
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
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
  lang: Lang;
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
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
      />
      <input
        value={feedUrl}
        onChange={(e) => setFeedUrl(e.target.value)}
        placeholder={t(lang, "feedUrlPlaceholder")}
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-neutral-400 dark:border-white/15"
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
