import { formatDistanceToNow } from "date-fns";
import { zhTW, enUS } from "date-fns/locale";
import type { Lang } from "./i18n";

export function formatRelativeTime(pubDate: string | null, lang: Lang = "zh"): string {
  if (!pubDate) return "";
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true, locale: lang === "zh" ? zhTW : enUS });
}
