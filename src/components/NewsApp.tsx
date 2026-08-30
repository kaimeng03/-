"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Article, ExtractedContent } from "@/lib/types";
import type { Category, Source } from "@/lib/sources";
import ArticleReader from "@/components/ArticleReader";
import ConfirmDialog from "@/components/ConfirmDialog";
import AddSourceFlow from "@/components/AddSourceFlow";
import { formatRelativeTime } from "@/lib/formatTime";
import { t, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/useLang";
import { useReadState } from "@/lib/useReadState";

type Filter = { type: "all" } | { type: "category"; id: string } | { type: "source"; id: string };
type View = "all" | "today" | "unread" | "saved";

type DialogState =
  | { kind: "confirm-remove-source"; source: Source }
  | { kind: "confirm-remove-category-empty"; category: Category }
  | { kind: "confirm-remove-category-step1"; category: Category; count: number }
  | { kind: "confirm-remove-category-step2"; category: Category; count: number }
  | null;

const REFRESH_TIMEOUT_MS = 15000;
const REFRESHED_FLASH_MS = 2500;
const TOAST_MS = 3000;

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
  user,
  signOutAction,
  professionKey,
}: {
  initialArticles: Article[];
  categories: Category[];
  sources: Source[];
  failedSourceNames: string[];
  lastUpdated: string;
  user?: { name: string | null; email: string | null; image: string | null };
  signOutAction?: () => Promise<void>;
  professionKey?: string | null;
}) {
  const router = useRouter();
  const articles = initialArticles;
  const [lang, setLang] = useLang();

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

  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const readState = useReadState(setToast);

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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

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
        // Single-page adapters (e.g. twarchitect): the scraped content already IS
        // the article. There's no separate full-article page worth fetching, so
        // this renders straight from what fetchAllArticles() already gathered
        // instead of attempting (and failing) live extraction against a listing page.
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

  // Add/delete just work once logged in — page.tsx already requires a
  // session to reach NewsApp at all, so there's no separate admin gate.
  function handleAddWebsiteClick() {
    setAddingSource((v) => !v);
  }

  function handleAddCategoryClick() {
    setAddingCategory(true);
  }

  function openRemoveCategoryDialog(category: Category) {
    const count = sources.filter((s) => s.categoryId === category.id).length;
    setDialogError(null);
    setDialog(
      count === 0
        ? { kind: "confirm-remove-category-empty", category }
        : { kind: "confirm-remove-category-step1", category, count },
    );
  }

  function requestRemoveSource(source: Source) {
    setDialogError(null);
    setDialog({ kind: "confirm-remove-source", source });
  }

  function requestRemoveCategory(category: Category) {
    openRemoveCategoryDialog(category);
  }

  async function doRemoveSource(source: Source) {
    setDeleting(true);
    setDialogError(null);
    try {
      const res = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDialogError(data.error || t(lang, "deleteFailed"));
        return;
      }
      setDialog(null);
      if (filter.type === "source" && filter.id === source.id) setFilter({ type: "all" });
      if (selected && selected.sourceId === source.id) {
        setSelected(null);
        setContent(null);
      }
      setToast(t(lang, "unfollowedSuccess", { name: source.name }));
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function doRemoveCategory(category: Category, force: boolean) {
    setDeleting(true);
    setDialogError(null);
    try {
      const res = await fetch(
        `/api/categories/${encodeURIComponent(category.id)}${force ? "?force=true" : ""}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDialogError(data.error || t(lang, "deleteFailed"));
        return;
      }
      setDialog(null);
      if (filter.type === "category" && filter.id === category.id) setFilter({ type: "all" });
      if (selected && selected.categoryId === category.id) {
        setSelected(null);
        setContent(null);
      }
      setToast(t(lang, "deletedCategorySuccess", { name: category.name }));
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <button
            type="button"
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
          {user && signOutAction && <UserMenu lang={lang} user={user} signOutAction={signOutAction} />}
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
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={t(lang, "closeMenu")}
            >
              ✕
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddWebsiteClick}
            className="mb-3 w-full rounded-md border border-dashed border-black/20 px-2 py-1.5 text-left text-sm font-medium text-neutral-600 transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {t(lang, "addWebsite")}
          </button>
          {addingSource && (
            <AddSourceFlow
              lang={lang}
              categories={categories}
              initialProfessionKey={professionKey ?? null}
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
              const catUnread = unreadCountFor((a) => a.categoryId === cat.id);
              return (
                <div key={cat.id}>
                  <div className="flex items-center">
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestRemoveCategory(cat);
                      }}
                      aria-label={t(lang, "removeCategoryLabel", { name: cat.name })}
                      title={t(lang, "removeCategoryLabel", { name: cat.name })}
                      className="ml-1 shrink-0 rounded px-1.5 py-1 text-sm text-neutral-400 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 dark:text-neutral-500"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="ml-3 mt-0.5 border-l border-black/10 pl-2 dark:border-white/10">
                    {catSources.map((s) => {
                      const srcUnread = unreadCountFor((a) => a.sourceId === s.id);
                      return (
                        <div key={s.id} className="flex items-center">
                          <SidebarButton
                            label={s.name}
                            badge={srcUnread > 0 ? srcUnread : undefined}
                            active={filter.type === "source" && filter.id === s.id}
                            onClick={() => selectFilter({ type: "source", id: s.id })}
                            compact
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestRemoveSource(s);
                            }}
                            aria-label={t(lang, "removeSourceLabel", { name: s.name })}
                            title={t(lang, "removeSourceLabel", { name: s.name })}
                            className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-sm text-neutral-400 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 dark:text-neutral-500"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
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
                  type="button"
                  onClick={handleAddCategoryClick}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-neutral-500 transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:hover:bg-white/10"
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
          {filtered.length === 0 && sources.length === 0 && (
            <li className="p-6 text-center">
              <p className="mb-1 text-sm font-medium">{t(lang, "emptyHomeTitle")}</p>
              <p className="mb-3 text-sm text-neutral-500">{t(lang, "emptyHomeSubtitle")}</p>
              <Link href="/onboarding" className="text-sm text-neutral-700 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
                {t(lang, "browseRecommended")}
              </Link>
            </li>
          )}
          {filtered.length === 0 && sources.length > 0 && (
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

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-neutral-900">
          {toast}
        </div>
      )}

      {dialog?.kind === "confirm-remove-source" && (
        <ConfirmDialog
          open
          title={t(lang, "removeSourceLabel", { name: dialog.source.name })}
          message={t(lang, "confirmRemoveSource", { name: dialog.source.name })}
          confirmLabel={deleting ? t(lang, "deleting") : t(lang, "confirmDelete")}
          cancelLabel={t(lang, "cancel")}
          danger
          busy={deleting}
          error={dialogError}
          onConfirm={() => doRemoveSource(dialog.source)}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "confirm-remove-category-empty" && (
        <ConfirmDialog
          open
          title={t(lang, "removeCategoryLabel", { name: dialog.category.name })}
          message={t(lang, "confirmRemoveCategoryEmpty", { name: dialog.category.name })}
          confirmLabel={deleting ? t(lang, "deleting") : t(lang, "confirmDelete")}
          cancelLabel={t(lang, "cancel")}
          danger
          busy={deleting}
          error={dialogError}
          onConfirm={() => doRemoveCategory(dialog.category, false)}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "confirm-remove-category-step1" && (
        <ConfirmDialog
          open
          title={t(lang, "removeCategoryLabel", { name: dialog.category.name })}
          message={t(lang, "confirmRemoveCategoryStep1", {
            name: dialog.category.name,
            count: String(dialog.count),
          })}
          confirmLabel={t(lang, "continueLabel")}
          cancelLabel={t(lang, "cancel")}
          onConfirm={() =>
            setDialog({ kind: "confirm-remove-category-step2", category: dialog.category, count: dialog.count })
          }
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "confirm-remove-category-step2" && (
        <ConfirmDialog
          open
          title={t(lang, "removeCategoryLabel", { name: dialog.category.name })}
          message={t(lang, "confirmRemoveCategoryStep2", {
            name: dialog.category.name,
            count: String(dialog.count),
          })}
          confirmLabel={deleting ? t(lang, "deleting") : t(lang, "confirmDelete")}
          cancelLabel={t(lang, "cancel")}
          danger
          busy={deleting}
          error={dialogError}
          onConfirm={() => doRemoveCategory(dialog.category, true)}
          onCancel={() => setDialog(null)}
        />
      )}
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

function UserMenu({
  lang,
  user,
  signOutAction,
}: {
  lang: Lang;
  user: { name: string | null; email: string | null; image: string | null };
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const label = user.name || user.email || "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-1.5 rounded-full border border-black/10 py-1 pl-1 pr-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        {user.image ? (
          <Image src={user.image} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-xs dark:bg-neutral-700">
            {label.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-black/10 bg-white p-1 text-sm shadow-lg dark:border-white/15 dark:bg-neutral-900"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="truncate px-2 py-1.5 text-xs text-neutral-500">{user.email}</div>
          <Link
            href="/settings"
            className="block rounded px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            {t(lang, "settingsLink")}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t(lang, "signOutButton")}
            </button>
          </form>
        </div>
      )}
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
