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
    noArticlesFiltered: "這個篩選條件下沒有文章。",
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

    // Content-gate notices (section 4)
    gateLoginWall: "原網站限制全文存取（需要登入或訂閱），以下為 RSS 提供的內容。",
    gateChallenge: "原網站目前有防機器人驗證機制，暫時無法自動擷取全文，以下為 RSS 提供的內容。",
    gateTooShort: "無法從原網站可靠地擷取完整內文，以下為 RSS 提供的內容。",
    gateClientError: "無法讀取這篇文章，請改到原始網頁閱讀。",
    summaryOnlyNotice: "只有摘要，原網站無法自動擷取完整內文。",

    // Delete / admin (section 2)
    removeSourceLabel: "取消關注 {name}",
    removeCategoryLabel: "刪除分類 {name}",
    confirmRemoveSource: "確定要取消關注「{name}」嗎？",
    confirmRemoveCategoryEmpty: "確定要刪除分類「{name}」嗎？",
    confirmRemoveCategoryNonEmpty: "分類「{name}」還有 {count} 個來源，確定要一併刪除嗎？",
    adminLoginButton: "管理者登入",
    adminLogoutButton: "登出管理",
    adminPasswordPlaceholder: "管理密碼",
    adminLoginSubmit: "登入",
    adminLoginError: "密碼錯誤",
    adminLoginRequired: "需要管理者登入才能新增或刪除",
    deleteFailed: "刪除失敗",

    // Read/unread/saved/search (section 6)
    filterAll: "全部",
    filterToday: "今天",
    filterUnread: "未讀",
    filterSaved: "已收藏",
    searchPlaceholder: "搜尋標題、來源、摘要…",
    markAllRead: "全部標為已讀",
    markRead: "標為已讀",
    markUnread: "標為未讀",
    saveArticle: "收藏文章",
    unsaveArticle: "取消收藏",
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
    noArticlesFiltered: "No articles match this filter.",
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

    gateLoginWall: "The original site restricts full access (login/subscription required) — showing RSS-provided content below.",
    gateChallenge: "The original site currently has bot-verification enabled, so the full article couldn't be fetched automatically — showing RSS-provided content below.",
    gateTooShort: "The full article couldn't be reliably extracted from the original site — showing RSS-provided content below.",
    gateClientError: "Couldn't load this article — please read it on the original site.",
    summaryOnlyNotice: "Only a summary is available; the original site's full content couldn't be fetched automatically.",

    removeSourceLabel: "Unfollow {name}",
    removeCategoryLabel: "Delete category {name}",
    confirmRemoveSource: "Unfollow “{name}”?",
    confirmRemoveCategoryEmpty: "Delete category “{name}”?",
    confirmRemoveCategoryNonEmpty: "Category “{name}” still has {count} source(s) — delete it and all of them?",
    adminLoginButton: "Admin login",
    adminLogoutButton: "Log out",
    adminPasswordPlaceholder: "Admin password",
    adminLoginSubmit: "Log in",
    adminLoginError: "Wrong password",
    adminLoginRequired: "Admin login is required to add or delete",
    deleteFailed: "Delete failed",

    filterAll: "All",
    filterToday: "Today",
    filterUnread: "Unread",
    filterSaved: "Saved",
    searchPlaceholder: "Search titles, sources, summaries…",
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    saveArticle: "Save article",
    unsaveArticle: "Remove from saved",
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
