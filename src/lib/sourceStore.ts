import { promises as fs } from "fs";
import path from "path";
import Parser from "rss-parser";
import { FALLBACK_CONFIG, type Category, type Source, type SourcesConfig } from "./sources";
import { discoverFeed } from "./feedDiscovery";

const LOCAL_FILE = path.join(process.cwd(), "data", "sources.json");
const GITHUB_API = "https://api.github.com";
const DATA_PATH = "data/sources.json";

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

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
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

export async function validateFeedUrl(feedUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "網址必須是 http:// 或 https://" };
    }
  } catch {
    return { ok: false, error: "網址格式不正確" };
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchNewsReader/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, error: `無法讀取這個網址 (HTTP ${res.status})` };
    const xml = await res.text();
    const feed = await new Parser().parseString(xml);
    if (!feed.items || feed.items.length === 0) {
      return { ok: false, error: "這個網址看起來不是有效的 RSS feed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "無法解析這個網址的 RSS 內容，請確認是不是正確的 RSS feed 網址" };
  }
}

export async function addCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("分類名稱不能是空的");

  const gh = githubConfig();
  const { content, sha } = gh ? await readFromGithub() : { content: await readLocal(), sha: null };

  const existingIds = new Set(content.categories.map((c) => c.id));
  const id = uniqueId(slugify(trimmed), existingIds);
  const category: Category = { id, name: trimmed };
  const updated: SourcesConfig = { ...content, categories: [...content.categories, category] };

  if (gh) {
    await writeToGithub(updated, sha, `Add category: ${trimmed}`);
  } else {
    await writeLocal(updated);
  }
  return category;
}

export async function addSource(input: {
  name: string;
  feedUrl: string;
  categoryId: string;
}): Promise<Source> {
  const name = input.name.trim();
  const inputUrl = input.feedUrl.trim();
  if (!name) throw new Error("網站名稱不能是空的");
  if (!inputUrl) throw new Error("網址不能是空的");

  // Accept either a direct RSS/Atom feed URL or a plain website homepage URL —
  // discoverFeed tries the URL as-is first, then HTML <link> autodiscovery,
  // then a short list of common feed paths. It never invents a feed URL.
  const discovery = await discoverFeed(inputUrl);
  if (!discovery.ok) throw new Error(discovery.error);
  const feedUrl = discovery.feedUrl;

  const validation = await validateFeedUrl(feedUrl);
  if (!validation.ok) throw new Error(validation.error);

  const gh = githubConfig();
  const { content, sha } = gh ? await readFromGithub() : { content: await readLocal(), sha: null };

  if (!content.categories.some((c) => c.id === input.categoryId)) {
    throw new Error("找不到這個分類");
  }

  const normalizedNew = normalizeUrl(feedUrl);
  if (content.sources.some((s) => normalizeUrl(s.feedUrl) === normalizedNew)) {
    throw new Error("這個新聞來源已經加入過了");
  }

  let homepage = feedUrl;
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

  const existingIds = new Set(content.sources.map((s) => s.id));
  const id = uniqueId(slugify(name), existingIds);
  const source: Source = { id, name, homepage, feedUrl, categoryId: input.categoryId };
  const updated: SourcesConfig = { ...content, sources: [...content.sources, source] };

  if (gh) {
    await writeToGithub(updated, sha, `Add source: ${name}`);
  } else {
    await writeLocal(updated);
  }
  return source;
}
