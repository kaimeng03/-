import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

export function formatRelativeTime(pubDate: string | null): string {
  if (!pubDate) return "";
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true, locale: zhTW });
}
