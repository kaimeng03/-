/** Canonicalizes a URL for dedup purposes: strips hash/trailing slash, lowercases. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const p = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${p}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
