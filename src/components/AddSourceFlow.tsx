"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { t, type Lang } from "@/lib/i18n";
import { PROFESSIONS } from "@/lib/professions";
import type { Category } from "@/lib/sources";

interface CatalogCard {
  id: string;
  name: string;
  homepage: string;
  connectorType: string;
  provider: string;
  verificationStatus: string;
  contentType: string;
  alreadySubscribed: boolean;
}

interface CatalogPreviewArticle {
  id: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  publishedAt: string | null;
  thumbnail: string | null;
}

interface CatalogPreviewState {
  loading: boolean;
  error: string | null;
  articles: CatalogPreviewArticle[] | null;
}

interface DiscoveryArticle {
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
}

interface DiscoveryPreview {
  inputType: string;
  detectedUrl: string | null;
  candidate: Record<string, unknown> | null;
  previewToken: string | null;
  articles: DiscoveryArticle[];
}

type ProviderChoice = "auto" | "crossref" | "europepmc" | "pubmed";

type Tab = "curated" | "search" | "manual";

function errorMessage(lang: Lang, errorCode: string | undefined, fallback: string): string {
  if (!errorCode) return fallback;
  const key = `errorCode_${errorCode}` as Parameters<typeof t>[1];
  const msg = t(lang, key);
  return msg.startsWith("errorCode_") ? fallback : msg;
}

function CategorySelect({
  categories,
  value,
  onChange,
  fullWidth = false,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${fullWidth ? "w-full" : ""} cursor-pointer rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs outline-none transition-colors duration-150 hover:border-neutral-400 hover:bg-black/5 active:bg-black/10 focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:border-white/15 dark:hover:border-white/30 dark:hover:bg-white/10 dark:active:bg-white/15`}
    >
      {categories.map((c) => (
        <option key={c.id} value={c.id} className="text-black">
          {c.name}
        </option>
      ))}
    </select>
  );
}

export default function AddSourceFlow({
  lang,
  categories,
  initialProfessionKey,
  onDone,
  onCancel,
}: {
  lang: Lang;
  categories: Category[];
  initialProfessionKey: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<Tab>("curated");
  const hasCategories = categories.length > 0;
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");

  if (!hasCategories) {
    return <p className="mb-3 text-xs text-neutral-500">{t(lang, "needCategoryFirst")}</p>;
  }

  return (
    <div className="mb-3 rounded-md border border-black/10 p-2 dark:border-white/15">
      <div className="mb-2 flex gap-1 border-b border-black/10 pb-2 dark:border-white/10">
        {(["curated", "search", "manual"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            aria-pressed={tab === tabKey}
            className={`rounded px-2 py-1 text-xs font-medium transition ${
              tab === tabKey
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
            }`}
          >
            {t(
              lang,
              tabKey === "curated" ? "addSourceTabCurated" : tabKey === "search" ? "addSourceTabSearch" : "addSourceTabManual",
            )}
          </button>
        ))}
      </div>

      {tab === "curated" && (
        <CuratedTab
          lang={lang}
          categories={categories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          initialProfessionKey={initialProfessionKey}
          onDone={onDone}
        />
      )}
      {tab === "search" && (
        <SearchTab lang={lang} categories={categories} categoryId={categoryId} setCategoryId={setCategoryId} onDone={onDone} />
      )}
      {tab === "manual" && (
        <ManualTab lang={lang} categories={categories} categoryId={categoryId} setCategoryId={setCategoryId} onDone={onDone} />
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-2 w-full rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
      >
        {t(lang, "cancel")}
      </button>
    </div>
  );
}

function FollowButton({
  lang,
  card,
  categoryId,
  categories,
  onFollowed,
}: {
  lang: Lang;
  card: CatalogCard;
  categoryId: string;
  categories: Category[];
  onFollowed: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Local override of the server-reported state so a follow/unfollow reflects
  // immediately without waiting on a full list refetch.
  const [subscribed, setSubscribed] = useState(card.alreadySubscribed);
  const [error, setError] = useState<string | null>(null);

  async function follow() {
    setBusy(true);
    setError(null);
    try {
      const categoryName = categories.find((c) => c.id === categoryId)?.name || "";
      const res = await fetch("/api/recommendations/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: card.id, categoryName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorMessage(lang, data.errorCode, data.error || t(lang, "genericAddSourceError")));
        return;
      }
      setSubscribed(true);
      onFollowed();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unfollow() {
    setBusy(true);
    setError(null);
    try {
      // Same DELETE the sidebar's own unfollow (✕) uses — it only ever
      // removes the current user's Subscription, never the global Source,
      // and never affects any other user.
      const res = await fetch(`/api/sources/${encodeURIComponent(card.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(lang, data.errorCode, data.error || t(lang, "deleteFailed")));
        return;
      }
      setSubscribed(false);
      onFollowed();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (subscribed) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={unfollow}
          disabled={busy}
          className="rounded-md border border-black/10 px-2 py-1 text-xs text-neutral-500 disabled:opacity-50 dark:border-white/15"
        >
          {busy ? t(lang, "deleting") : t(lang, "curatedUnfollowButton")}
        </button>
        {error && <p className="max-w-[10rem] text-right text-[10px] text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={follow}
        disabled={busy}
        className="rounded-md border border-black/10 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/15"
      >
        {busy ? t(lang, "curatedFollowing") : t(lang, "curatedFollowButton")}
      </button>
      {error && <p className="max-w-[10rem] text-right text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

function CatalogList({
  lang,
  cards,
  categoryId,
  categories,
  emptyKey,
  onFollowed,
}: {
  lang: Lang;
  cards: CatalogCard[];
  categoryId: string;
  categories: Category[];
  emptyKey: "curatedEmpty" | "catalogSearchEmpty";
  onFollowed: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, CatalogPreviewState>>({});

  async function togglePreview(card: CatalogCard) {
    if (selectedId === card.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(card.id);
    if (previews[card.id]) return;

    setPreviews((current) => ({ ...current, [card.id]: { loading: true, error: null, articles: null } }));
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(card.id)}/preview`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t(lang, "catalogPreviewFailed"));
      setPreviews((current) => ({
        ...current,
        [card.id]: { loading: false, error: null, articles: Array.isArray(data.articles) ? data.articles : [] },
      }));
    } catch (err) {
      setPreviews((current) => ({
        ...current,
        [card.id]: { loading: false, error: err instanceof Error ? err.message : t(lang, "catalogPreviewFailed"), articles: null },
      }));
    }
  }

  if (cards.length === 0) {
    return <p className="py-3 text-xs text-neutral-500">{t(lang, emptyKey)}</p>;
  }
  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto">
      {cards.map((card) => {
        const preview = previews[card.id];
        const expanded = selectedId === card.id;
        return (
        <li key={card.id} className="rounded border border-black/5 dark:border-white/10">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <button
              type="button"
              onClick={() => togglePreview(card)}
              aria-expanded={expanded}
              className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition hover:bg-black/5 active:scale-[0.99] active:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:hover:bg-white/10 dark:active:bg-white/15"
            >
              <p className="truncate text-sm">{card.name}</p>
              <p className="truncate text-[10px] text-neutral-400">
                {card.provider} · {card.verificationStatus === "verified" ? t(lang, "catalogVerified") : t(lang, "catalogUnverified")} · {expanded ? t(lang, "catalogPreviewClose") : t(lang, "catalogPreviewHint")}
              </p>
            </button>
            <FollowButton lang={lang} card={card} categoryId={categoryId} categories={categories} onFollowed={onFollowed} />
          </div>
          {expanded && (
            <div className="border-t border-black/5 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-neutral-500">{t(lang, "catalogPreviewArticles")}</span>
                <a href={card.homepage} target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 underline hover:text-neutral-900 dark:hover:text-white">
                  {t(lang, "catalogOpenWebsite")}
                </a>
              </div>
              {preview?.loading && <p className="py-2 text-xs text-neutral-500">{t(lang, "catalogPreviewLoading")}</p>}
              {preview?.error && <p className="py-2 text-xs text-red-600 dark:text-red-400">{preview.error}</p>}
              {preview?.articles?.length === 0 && <p className="py-2 text-xs text-neutral-500">{t(lang, "catalogPreviewEmpty")}</p>}
              {preview?.articles && preview.articles.length > 0 && (
                <ul className="space-y-2">
                  {preview.articles.map((article) => (
                    <li key={article.id} className="flex gap-2">
                      {article.thumbnail && (
                        <Image
                          src={`/api/image?url=${encodeURIComponent(article.thumbnail)}`}
                          alt=""
                          width={64}
                          height={40}
                          unoptimized
                          className="h-10 w-16 shrink-0 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <a href={article.canonicalUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium hover:underline">
                          {article.title}
                        </a>
                        {article.summary && <p className="mt-0.5 truncate text-[10px] text-neutral-500">{article.summary}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </li>
        );
      })}
    </ul>
  );
}

function CuratedTab({
  lang,
  categories,
  categoryId,
  setCategoryId,
  initialProfessionKey,
  onDone,
}: {
  lang: Lang;
  categories: Category[];
  categoryId: string;
  setCategoryId: (id: string) => void;
  initialProfessionKey: string | null;
  onDone: () => void;
}) {
  const [professionKey, setProfessionKey] = useState(initialProfessionKey || PROFESSIONS[0].key);
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(key: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/recommendations?profession=${encodeURIComponent(key)}`);
      const data = await res.json();
      setCards(Array.isArray(data.sources) ? data.sources : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => load(professionKey));
  }, [professionKey]);

  return (
    <div>
      <div className="mb-2 space-y-2">
        <label className="block text-xs text-neutral-500">
          <span className="mb-1 block">{t(lang, "curatedProfessionLabel")}</span>
        <select
          value={professionKey}
          onChange={(e) => setProfessionKey(e.target.value)}
          className="w-full cursor-pointer rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs outline-none transition-colors duration-150 hover:border-neutral-400 hover:bg-black/5 active:bg-black/10 focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:border-white/15 dark:hover:border-white/30 dark:hover:bg-white/10 dark:active:bg-white/15"
        >
          {PROFESSIONS.filter((p) => p.key !== "other").map((p) => (
            <option key={p.key} value={p.key} className="text-black">
              {lang === "zh" ? p.labelZh : p.labelEn}
            </option>
          ))}
        </select>
        </label>
        <label className="block text-xs text-neutral-500">
          <span className="mb-1 block">{t(lang, "manualChooseCategory")}</span>
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} fullWidth />
        </label>
      </div>
      {professionKey === "health" && <p className="mb-2 text-[10px] text-amber-600 dark:text-amber-400">{t(lang, "healthDisclaimer")}</p>}
      {loading ? (
        <p className="py-3 text-xs text-neutral-500">{t(lang, "loadingContent")}</p>
      ) : (
        <CatalogList lang={lang} cards={cards} categoryId={categoryId} categories={categories} emptyKey="curatedEmpty" onFollowed={onDone} />
      )}
    </div>
  );
}

function SearchTab({
  lang,
  categories,
  categoryId,
  setCategoryId,
  onDone,
}: {
  lang: Lang;
  categories: Category[];
  categoryId: string;
  setCategoryId: (id: string) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setCards(Array.isArray(data.sources) ? data.sources : []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="mb-1 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(lang, "catalogSearchPlaceholder")}
          className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs outline-none dark:border-white/15"
        />
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
        <button type="submit" disabled={loading} className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
          {t(lang, "catalogSearchButton")}
        </button>
      </form>
      <p className="mb-2 text-[10px] text-neutral-400">{t(lang, "catalogSearchHint")}</p>
      {searched && (
        <CatalogList lang={lang} cards={cards} categoryId={categoryId} categories={categories} emptyKey="catalogSearchEmpty" onFollowed={onDone} />
      )}
    </div>
  );
}

function ManualTab({
  lang,
  categories,
  categoryId,
  setCategoryId,
  onDone,
}: {
  lang: Lang;
  categories: Category[];
  categoryId: string;
  setCategoryId: (id: string) => void;
  onDone: () => void;
}) {
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<ProviderChoice>("auto");
  const [detecting, setDetecting] = useState(false);
  const [preview, setPreview] = useState<DiscoveryPreview | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "busy" | "done">("idle");

  async function detect(e: React.FormEvent) {
    e.preventDefault();
    setDetecting(true);
    setError(null);
    setPreview(null);
    setSubmitState("idle");
    try {
      const res = await fetch("/api/source-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ code: data.errorCode, message: errorMessage(lang, data.errorCode, data.message || t(lang, "genericAddSourceError")) });
        return;
      }
      setPreview(data);
    } catch {
      setError({ message: t(lang, "genericAddSourceError") });
    } finally {
      setDetecting(false);
    }
  }

  async function confirm() {
    if (!preview?.previewToken) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/source-discovery/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewToken: preview.previewToken, categoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ code: data.errorCode, message: errorMessage(lang, data.errorCode, data.message || t(lang, "genericAddSourceError")) });
        return;
      }
      onDone();
    } finally {
      setConfirming(false);
    }
  }

  async function submitRequest() {
    setSubmitState("busy");
    try {
      await fetch("/api/source-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          inputType: "unknown",
          failureCode: error?.code,
          failureReason: error?.message,
        }),
      });
      setSubmitState("done");
    } catch {
      setSubmitState("idle");
    }
  }

  return (
    <div>
      <form onSubmit={detect} className="mb-2">
        <p className="mb-2 text-xs text-neutral-500">{t(lang, "manualSimpleHint")}</p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(lang, provider === "auto" ? "manualSimplePlaceholder" : "manualInputPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs outline-none dark:border-white/15"
          />
          <button
            type="submit"
            disabled={detecting || !input.trim()}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {detecting ? t(lang, "manualDetecting") : t(lang, "manualDetectButton")}
          </button>
        </div>
        <details className="mt-2 text-xs text-neutral-500">
          <summary className="cursor-pointer select-none">{t(lang, "manualAdvancedOptions")}</summary>
          <div className="mt-2 rounded-md bg-black/[0.03] p-2 dark:bg-white/[0.05]">
            <p className="mb-1 text-[10px]">{t(lang, "manualAdvancedHint")}</p>
            <label className="flex items-center gap-2">
              <span>{t(lang, "manualProviderLabel")}</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderChoice)}
                aria-label={t(lang, "manualProviderLabel")}
                className="rounded-md border border-black/10 bg-transparent px-1 py-1 text-xs outline-none dark:border-white/15"
              >
                <option value="auto" className="text-black">{t(lang, "manualProviderAuto")}</option>
                <option value="crossref" className="text-black">Crossref</option>
                <option value="europepmc" className="text-black">Europe PMC</option>
                <option value="pubmed" className="text-black">PubMed</option>
              </select>
            </label>
          </div>
        </details>
      </form>

      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p>{error.message}</p>
          {(error.code === "ACCESS_BLOCKED" || error.code === "RATE_LIMITED" || error.code === "UNSUPPORTED_SOURCE" || error.code === "NO_FEED_FOUND") && (
            <button
              type="button"
              onClick={submitRequest}
              disabled={submitState !== "idle"}
              className="mt-1 rounded border border-red-300 px-2 py-0.5 text-[10px] disabled:opacity-50 dark:border-red-800"
            >
              {submitState === "busy"
                ? t(lang, "submitRequestSubmitting")
                : submitState === "done"
                  ? t(lang, "submitRequestSuccess")
                  : t(lang, "submitRequestButton")}
            </button>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded border border-black/10 p-2 dark:border-white/15">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium">{t(lang, "manualPreviewTitle")}</p>
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
          </div>
          {preview.articles.length > 0 ? (
            <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto text-xs text-neutral-600 dark:text-neutral-300">
              {preview.articles.slice(0, 5).map((a, i) => (
                <li key={i} className="truncate">
                  {a.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-xs text-neutral-500">{preview.detectedUrl}</p>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={confirming || !preview.previewToken}
            className="w-full rounded-md bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {confirming ? t(lang, "manualConfirming") : t(lang, "manualConfirmButton")}
          </button>
        </div>
      )}
    </div>
  );
}
