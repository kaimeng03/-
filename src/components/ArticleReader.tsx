"use client";

import type { Article, ExtractedContent, ContentGateKind } from "@/lib/types";
import { formatRelativeTime } from "@/lib/formatTime";
import { t, type Lang } from "@/lib/i18n";

const GATE_KEY: Record<ContentGateKind, "gateLoginWall" | "gateChallenge" | "gateTooShort" | "gateClientError"> = {
  "login-wall": "gateLoginWall",
  challenge: "gateChallenge",
  "too-short": "gateTooShort",
  "client-error": "gateClientError",
};

export default function ArticleReader({
  article,
  content,
  loading,
  lang,
  isRead,
  isSaved,
  onToggleRead,
  onToggleSaved,
  onBack,
}: {
  article: Article | null;
  content: ExtractedContent | null;
  loading: boolean;
  lang: Lang;
  isRead: boolean;
  isSaved: boolean;
  onToggleRead: () => void;
  onToggleSaved: () => void;
  onBack: () => void;
}) {
  if (!article) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-400">
        {t(lang, "selectArticlePrompt")}
      </div>
    );
  }

  const fallbackTitle = lang === "zh" ? article.titleZh : article.titleEn;
  const title = content ? (lang === "zh" ? content.titleZh : content.titleEn) || fallbackTitle : fallbackTitle;
  const html = content ? (lang === "zh" ? content.htmlZh : content.htmlEn) : null;
  const fallbackSummary = lang === "zh" ? article.summaryZh : article.summaryEn;

  return (
    <article className="mx-auto max-w-2xl px-5 py-6">
      <div className="mb-4 flex items-center justify-between md:hidden">
        <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
          {t(lang, "backToList")}
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
        <span className="font-medium text-neutral-600 dark:text-neutral-400">{article.sourceName}</span>
        <span>·</span>
        <span>{formatRelativeTime(article.pubDate, lang)}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleSaved}
            aria-pressed={isSaved}
            aria-label={t(lang, isSaved ? "unsaveArticle" : "saveArticle")}
            className="rounded px-1.5 py-1 text-sm text-neutral-400 hover:text-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500"
          >
            {isSaved ? "★" : "☆"}
          </button>
          <button
            type="button"
            onClick={onToggleRead}
            className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500 dark:hover:bg-white/10"
          >
            {t(lang, isRead ? "markUnread" : "markRead")}
          </button>
        </div>
      </div>

      <h1 className="mb-4 text-2xl font-bold leading-tight">{title}</h1>

      {loading && <div className="py-10 text-center text-sm text-neutral-400">{t(lang, "loadingContent")}</div>}

      {!loading && content?.status === "unavailable" && (
        <GateNotice lang={lang} gate={content.gate} article={article} />
      )}

      {!loading && content?.status === "summary-only" && (
        <>
          <GateNotice lang={lang} gate={content.gate} article={article} />
          <p className="mt-4 whitespace-pre-line text-neutral-700 dark:text-neutral-300">{fallbackSummary}</p>
        </>
      )}

      {!loading && content?.status === "feed-content" && (
        <>
          <GateNotice lang={lang} gate={content.gate} article={article} />
          {html && <div className="article-content mt-4" dangerouslySetInnerHTML={{ __html: html }} />}
        </>
      )}

      {!loading && content?.status === "full" && html && (
        <>
          <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-block text-sm text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {t(lang, "viewOriginalShort")}
          </a>
        </>
      )}
    </article>
  );
}

function GateNotice({
  lang,
  gate,
  article,
}: {
  lang: Lang;
  gate: ContentGateKind | undefined;
  article: Article;
}) {
  const message = t(lang, gate ? GATE_KEY[gate] : "gateTooShort");
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p className="mb-2">{message}</p>
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="underline">
        {t(lang, "viewOriginalLong")}
      </a>
    </div>
  );
}
