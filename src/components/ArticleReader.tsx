"use client";

import type { Article, ExtractedContent } from "@/lib/types";
import { formatRelativeTime } from "@/lib/formatTime";

export default function ArticleReader({
  article,
  content,
  loading,
  error,
  lang,
  onBack,
}: {
  article: Article | null;
  content: ExtractedContent | null;
  loading: boolean;
  error: string | null;
  lang: "zh" | "en";
  onBack: () => void;
}) {
  if (!article) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-400">
        從左側選一篇文章開始閱讀
      </div>
    );
  }

  const fallbackTitle = lang === "zh" ? article.titleZh : article.titleEn;
  const title = content ? (lang === "zh" ? content.titleZh : content.titleEn) : fallbackTitle;
  const html = content ? (lang === "zh" ? content.htmlZh : content.htmlEn) : null;

  return (
    <article className="mx-auto max-w-2xl px-5 py-6">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-neutral-500 hover:text-neutral-800 md:hidden dark:hover:text-neutral-200"
      >
        ← 回列表
      </button>

      <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
        <span className="font-medium text-neutral-600 dark:text-neutral-400">
          {article.sourceName}
        </span>
        <span>·</span>
        <span>{formatRelativeTime(article.pubDate)}</span>
      </div>

      <h1 className="mb-4 text-2xl font-bold leading-tight">{title}</h1>

      {loading && (
        <div className="py-10 text-center text-sm text-neutral-400">內文載入中…</div>
      )}

      {error && !loading && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="mb-2">無法自動擷取完整內文：{error}</p>
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            前往原始網頁閱讀 →
          </a>
        </div>
      )}

      {html && !loading && !error && (
        <>
          <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-block text-sm text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            查看原始網頁 →
          </a>
        </>
      )}
    </article>
  );
}
