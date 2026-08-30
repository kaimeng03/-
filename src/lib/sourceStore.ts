import { promises as fs } from "fs";
import path from "path";
import Parser from "rss-parser";
import { FALLBACK_CONFIG, type Category, type Source, type SourcesConfig } from "./sources";
import { discoverFeed } from "./feedDiscovery";
import { safeFetch, readBodyWithLimit, UnsafeUrlError } from "./safeFetch";
import { matchHtmlSourceAdapter, getHtmlAdapter } from "./adapters";
import { normalizeUrl } from "./normalizeUrl";

const LOCAL_FILE = path.join(process.cwd(), "data", "sources.json");
const GITHUB_API = "https://api.github.com";
const DATA_PATH = "data/sources.json";

export class NotFoundError extends Error {}
export class CategoryNotEmptyError extends Error {
  sourceCount: number;
  constructor(sourceCount: number) {
    super(`Category still has ${sourceCount} source(s)`);
    this.sourceCount = sourceCount;
  }
}
class GithubConflictError extends Error {}

function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/repo"
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return null;
  return { token, repo, branch };
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || Math.random().toString(36).slice(2, 8);
}

function uniqueId(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

interface GithubFile {
  content: SourcesConfig;
  sha: string | null;
}

async function readFromGithub(): Promise<GithubFile> {
  const gh = githubConfig();
  if (!gh) throw new Error("GitHub store not configured");

  const url = `${GITHUB_API}/repos/${gh.repo}/contents/${DATA_PATH}?ref=${gh.branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });

  if (res.status === 404) {
    return { content: FALLBACK_CONFIG, sha: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub read failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { content: string; sha: string };
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return { content: JSON.parse(decoded) as SourcesConfig, sha: data.sha };
}

async function writeToGithub(config: SourcesConfig, sha: string | null, message: string): Promise<void> {
  const gh = githubConfig();
  if (!gh) throw new Error("GitHub store not configured");

  const url = `${GITHUB_API}/repos/${gh.repo}/contents/${DATA_PATH}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(config, null, 2), "utf-8").toString("base64"),
    branch: gh.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    throw new GithubConflictError("GitHub sha conflict — the file changed since it was read");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub write failed: HTTP ${res.status} ${text}`);
  }
}

async function readLocal(): Promise<SourcesConfig> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf-8");
    return JSON.parse(raw) as SourcesConfig;
  } catch {
    return FALLBACK_CONFIG;
  }
}

async function writeLocal(config: SourcesConfig): Promise<void> {
  await fs.writeFile(LOCAL_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** Always reads the repo's data/sources.json directly — used by the legacy
 *  import flow, which is explicitly about that file, not whatever the current
 *  live admin store (possibly GitHub-backed) happens to contain. */
export async function readLegacySourcesJsonFile(): Promise<SourcesConfig> {
  return readLocal();
}

export async function getSourcesConfig(): Promise<SourcesConfig> {
  if (githubConfig()) {
    try {
      return (await readFromGithub()).content;
    } catch (err) {
      console.error("Falling back to local sources.json:", err);
    }
  }
  return readLocal();
}

/**
 * Reads the current config, applies `mutate`, and writes the result back. On a
 * GitHub sha conflict (someone else wrote in between the read and this write) it
 * re-reads and retries exactly once — a plausible race for a single-admin tool,
 * not something worth an unbounded retry loop.
 */
async function mutateConfig<T>(
  mutate: (content: SourcesConfig) => { updated: SourcesConfig; result: T; message: string },
): Promise<T> {
  const gh = githubConfig();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, sha } = gh ? await readFromGithub() : { content: await readLocal(), sha: null };
    const { updated, result, message } = mutate(content);

    if (gh) {
      try {
        await writeToGithub(updated, sha, message);
        return result;
      } catch (err) {
        if (err instanceof GithubConflictError && attempt === 0) continue;
        throw err;
      }
    }
    await writeLocal(updated);
    return result;
  }
  throw new Error("寫入失敗，請稍後再試");
}

export async function validateFeedUrl(feedUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { response } = await safeFetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
      timeoutMs: 10000,
    });
    if (!response.ok) return { ok: false, error: `無法讀取這個網址 (HTTP ${response.status})` };
    const buf = await readBodyWithLimit(response, 5 * 1024 * 1024);
    const xml = new TextDecoder("utf-8").decode(buf);
    const feed = await new Parser().parseString(xml);
    if (!feed.items || feed.items.length === 0) {
      return { ok: false, error: "這個網址看起來不是有效的 RSS feed" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { ok: false, error: err.message };
    return { ok: false, error: "無法解析這個網址的 RSS 內容，請確認是不是正確的 RSS feed 網址" };
  }
}

export async function addCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("分類名稱不能是空的");

  return mutateConfig((content) => {
    const existingIds = new Set(content.categories.map((c) => c.id));
    const id = uniqueId(slugify(trimmed), existingIds);
    const category: Category = { id, name: trimmed };
    return {
      updated: { ...content, categories: [...content.categories, category] },
      result: category,
      message: `Add category: ${trimmed}`,
    };
  });
}

export async function addSource(input: { name: string; feedUrl: string; categoryId: string }): Promise<Source> {
  const name = input.name.trim();
  const inputUrl = input.feedUrl.trim();
  if (!name) throw new Error("網站名稱不能是空的");
  if (!inputUrl) throw new Error("網址不能是空的");

  // Some sites have no RSS/Atom feed at all and are handled by a dedicated HTML
  // adapter instead (see src/lib/adapters). That's checked FIRST and centrally
  // here — if it matches, we skip discoverFeed/validateFeedUrl entirely rather
  // than trying (and failing) to treat the page as a feed.
  const htmlMatch = matchHtmlSourceAdapter(inputUrl);

  let feedUrl: string;
  let homepage: string;
  let extraFields: Pick<Source, "type" | "adapter" | "pageUrl"> = {};

  if (htmlMatch) {
    const adapterFn = getHtmlAdapter(htmlMatch.adapter);
    if (!adapterFn) throw new Error("找不到對應的網站解析器");

    let articles;
    try {
      articles = await adapterFn(htmlMatch.pageUrl);
    } catch {
      throw new Error("無法讀取這個網站的新聞列表，請稍後再試");
    }
    if (!articles || articles.length === 0) {
      throw new Error("這個網站目前沒有偵測到任何新聞項目");
    }

    feedUrl = htmlMatch.pageUrl;
    homepage = htmlMatch.homepage;
    extraFields = { type: "html", adapter: htmlMatch.adapter, pageUrl: htmlMatch.pageUrl };
  } else {
    // Accept either a direct RSS/Atom feed URL or a plain website homepage URL —
    // discoverFeed tries the URL as-is first, then HTML <link> autodiscovery,
    // then a short list of common feed paths. It never invents a feed URL.
    const discovery = await discoverFeed(inputUrl);
    if (!discovery.ok) throw new Error(discovery.error);
    feedUrl = discovery.feedUrl;

    const validation = await validateFeedUrl(feedUrl);
    if (!validation.ok) throw new Error(validation.error);

    homepage = feedUrl;
    try {
      // Prefer the origin of what the user actually typed (often the homepage),
      // falling back to the discovered feed's origin if that's not parseable.
      const u = new URL(inputUrl);
      homepage = `${u.protocol}//${u.host}`;
    } catch {
      try {
        const u = new URL(feedUrl);
        homepage = `${u.protocol}//${u.host}`;
      } catch {
        // keep feedUrl as last-resort fallback
      }
    }
  }

  return mutateConfig((content) => {
    if (!content.categories.some((c) => c.id === input.categoryId)) {
      throw new NotFoundError("找不到這個分類");
    }
    const normalizedNew = normalizeUrl(feedUrl);
    if (content.sources.some((s) => normalizeUrl(s.feedUrl) === normalizedNew)) {
      throw new Error(htmlMatch ? "已經關注這個新聞來源了" : "這個新聞來源已經加入過了");
    }

    const existingIds = new Set(content.sources.map((s) => s.id));
    const id = uniqueId(slugify(name), existingIds);
    const source: Source = { id, name, homepage, feedUrl, categoryId: input.categoryId, ...extraFields };
    return {
      updated: { ...content, sources: [...content.sources, source] },
      result: source,
      message: `Add source: ${name}`,
    };
  });
}

export async function removeSource(id: string): Promise<void> {
  await mutateConfig((content) => {
    const target = content.sources.find((s) => s.id === id);
    if (!target) throw new NotFoundError("找不到這個網站來源");
    return {
      updated: { ...content, sources: content.sources.filter((s) => s.id !== id) },
      result: undefined,
      message: `Remove source: ${target.name}`,
    };
  });
}

export async function removeCategory(id: string, options: { force?: boolean } = {}): Promise<void> {
  await mutateConfig((content) => {
    const target = content.categories.find((c) => c.id === id);
    if (!target) throw new NotFoundError("找不到這個分類");

    const sourcesInCategory = content.sources.filter((s) => s.categoryId === id);
    if (sourcesInCategory.length > 0 && !options.force) {
      throw new CategoryNotEmptyError(sourcesInCategory.length);
    }

    return {
      updated: {
        categories: content.categories.filter((c) => c.id !== id),
        sources: content.sources.filter((s) => s.categoryId !== id),
      },
      result: undefined,
      message:
        sourcesInCategory.length > 0
          ? `Remove category: ${target.name} (and ${sourcesInCategory.length} source(s))`
          : `Remove category: ${target.name}`,
    };
  });
}
