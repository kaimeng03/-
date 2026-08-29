// Minimal hand-rolled i18n dictionary for the app's UI chrome (buttons, labels, messages).
// This does NOT translate RSS article content — that's handled separately by lib/translate.ts.

export type Lang = "zh" | "en";

const dict = {
  zh: {
    appTitle: "建築新聞",
    openMenu: "開啟分類選單",
    closeMenu: "關閉分類選單",
    categoriesLabel: "分類",
    refresh: "重新整理",
    refreshing: "更新中…",
    refreshed: "更新完成",
    lastUpdated: "上次更新：{time}",
    sourcesFailedNotice: "{names} 更新失敗，其他來源正常",
    addWebsite: "＋ 新增網站",
    addCategory: "＋ 新增分類",
    allArticles: "全部文章",
    noArticles: "目前沒有文章，稍後再試試「重新整理」。",
    selectArticlePrompt: "從左側選一篇文章開始閱讀",
    backToList: "← 回列表",
    loadingContent: "內文載入中…",
    extractFailedPrefix: "無法自動擷取完整內文：",
    viewOriginalLong: "前往原始網頁閱讀 →",
    viewOriginalShort: "查看原始網頁 →",
    categoryNamePlaceholder: "分類名稱，例如：室內設計",
    websiteNamePlaceholder: "網站名稱",
    feedUrlPlaceholder: "RSS 網址或網站首頁網址 (https://...)",
    needCategoryFirst: "請先新增一個分類，才能加入網站。",
    add: "新增",
    adding: "新增中…",
    addingSource: "偵測 RSS 並新增中…",
    cancel: "取消",
    genericAddCategoryError: "新增分類失敗",
    genericAddSourceError: "新增網站失敗",
  },
  en: {
    appTitle: "Architecture News",
    openMenu: "Open category menu",
    closeMenu: "Close category menu",
    categoriesLabel: "Categories",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    refreshed: "Updated",
    lastUpdated: "Last updated: {time}",
    sourcesFailedNotice: "{names} failed to update, other sources are fine",
    addWebsite: "＋ Add Website",
    addCategory: "＋ Add Category",
    allArticles: "All Articles",
    noArticles: "No articles yet — try “Refresh” again in a bit.",
    selectArticlePrompt: "Select an article from the left to start reading",
    backToList: "← Back to list",
    loadingContent: "Loading article…",
    extractFailedPrefix: "Couldn't automatically extract the full article: ",
    viewOriginalLong: "Read on the original site →",
    viewOriginalShort: "View original →",
    categoryNamePlaceholder: "Category name, e.g. Interior Design",
    websiteNamePlaceholder: "Website name",
    feedUrlPlaceholder: "RSS feed URL or website homepage (https://...)",
    needCategoryFirst: "Please add a category first before adding a website.",
    add: "Add",
    adding: "Adding…",
    addingSource: "Detecting feed & adding…",
    cancel: "Cancel",
    genericAddCategoryError: "Failed to add category",
    genericAddSourceError: "Failed to add website",
  },
} satisfies Record<Lang, Record<string, string>>;

export type I18nKey = keyof typeof dict.zh;

// Compile-time guarantee that "en" defines every key "zh" defines (and vice versa,
// via the `satisfies` above) — a missing translation key becomes a type error, not
// a silent runtime fallback.
const _assertEnComplete: Record<I18nKey, string> = dict.en;
void _assertEnComplete;

export function t(lang: Lang, key: I18nKey, vars?: Record<string, string>): string {
  let str: string = dict[lang][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}
