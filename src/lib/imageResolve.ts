// Generic image-URL resolution for scraped HTML: real-world pages hide the actual
// image behind various lazy-loading attributes instead of a plain <img src>, and
// relative URLs need resolving against the page's own URL, not the reader's.

const MIN_DIMENSION = 32; // filters out 1x1 tracking pixels and small icons

function firstFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  // "url1 1x, url2 2x" or "url1 300w, url2 768w" — take the first URL, whichever it is.
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first || null;
}

function isTooSmall(el: Element): boolean {
  const w = Number(el.getAttribute("width"));
  const h = Number(el.getAttribute("height"));
  if (Number.isFinite(w) && w > 0 && w < MIN_DIMENSION) return true;
  if (Number.isFinite(h) && h > 0 && h < MIN_DIMENSION) return true;
  return false;
}

/** Resolves the real (possibly lazy-loaded) URL of an <img> or <picture><source>, absolute. */
export function resolveImageUrl(el: Element, baseUrl: string): string | null {
  if (isTooSmall(el)) return null;

  let raw: string | null = null;
  if (el.tagName.toLowerCase() === "source") {
    raw = firstFromSrcset(el.getAttribute("srcset")) || el.getAttribute("src");
  } else {
    for (const attr of ["data-src", "data-lazy-src", "data-original"]) {
      const v = el.getAttribute(attr);
      if (v) {
        raw = v;
        break;
      }
    }
    if (!raw) raw = firstFromSrcset(el.getAttribute("data-srcset") || el.getAttribute("srcset"));
    if (!raw) raw = el.getAttribute("src");
  }
  if (!raw || raw.startsWith("data:")) return null;

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Finds the first usable content image within a subtree (handles <picture>, lazy attrs). */
export function findFirstImage(root: Element, baseUrl: string): string | null {
  const candidates = root.querySelectorAll("picture source, img");
  for (const el of Array.from(candidates)) {
    const url = resolveImageUrl(el, baseUrl);
    if (url) return url;
  }
  return null;
}

/** Page-level fallback: Open Graph og:image, then the first JSON-LD "image". */
export function findPageFallbackImage(doc: Document, baseUrl: string): string | null {
  const og = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (og) {
    try {
      return new URL(og, baseUrl).toString();
    } catch {
      /* fall through */
    }
  }

  const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(ldScripts)) {
    try {
      const data = JSON.parse(script.textContent || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const img = item?.image;
        const url = typeof img === "string" ? img : Array.isArray(img) ? img[0] : img?.url;
        if (typeof url === "string") return new URL(url, baseUrl).toString();
      }
    } catch {
      continue;
    }
  }
  return null;
}
