import { Prisma } from "../../generated/prisma/client";
import { prisma } from "./prisma";
import type { Category, Source, SourcesConfig } from "@/lib/sources";
import { discoverFeed } from "@/lib/feedDiscovery";
import { validateFeedUrl, NotFoundError, CategoryNotEmptyError } from "@/lib/sourceStore";
import { matchHtmlSourceAdapter, getHtmlAdapter } from "@/lib/adapters";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { isKnownProfessionKey } from "@/lib/professions";
import { stripTrackingParams } from "@/lib/connectors/trackingParams";
import type { SourceCandidate } from "@/lib/connectors/types";
import { ConnectorError } from "@/lib/connectors/errors";

/**
 * Per-user data layer backed by Prisma. A `Source` is global and may be
 * shared by many users' `Subscription` rows (deduped by `normalizedUrl`);
 * `UserCategory` and `Subscription` are always scoped to `userId` — every
 * query here takes userId from the caller's session, never from client input.
 */

function toCategory(c: { id: string; name: string }): Category {
  return { id: c.id, name: c.name };
}

function toSource(sub: {
  categoryId: string | null;
  source: {
    id: string;
    name: string;
    homepage: string;
    feedUrl: string | null;
    type: string;
    connectorType?: string;
    provider?: string;
    connectorConfig?: unknown;
    pageUrl: string | null;
    adapter: string | null;
  };
}): Source {
  const s = sub.source;
  return {
    id: s.id,
    name: s.name,
    homepage: s.homepage,
    feedUrl: s.feedUrl ?? s.homepage,
    categoryId: sub.categoryId ?? "",
    ...(s.type === "html" ? { type: "html" as const, adapter: s.adapter ?? undefined, pageUrl: s.pageUrl ?? undefined } : {}),
    // API-provider sources dispatch through src/lib/feeds.ts by provider —
    // connectorConfig here is always the public query config written by
    // addSourceFromCandidate (query/term/issn), never a secret.
    ...(s.connectorType === "api"
      ? {
          type: "api" as const,
          provider: s.provider,
          connectorConfig: (s.connectorConfig as Record<string, unknown> | null) ?? null,
        }
      : {}),
  };
}

/** Reads the current user's categories + subscribed sources, in the same shape
 *  the rest of the app (NewsApp, fetchAllArticles) already expects. */
export async function getUserSourcesConfig(userId: string): Promise<SourcesConfig> {
  const [categories, subscriptions] = await Promise.all([
    prisma.userCategory.findMany({ where: { userId }, orderBy: { position: "asc" } }),
    prisma.subscription.findMany({
      where: { userId },
      include: { source: true },
    }),
  ]);

  return {
    categories: categories.map(toCategory),
    sources: subscriptions.map(toSource),
  };
}

export async function addUserCategory(userId: string, name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("分類名稱不能是空的");

  const count = await prisma.userCategory.count({ where: { userId } });
  try {
    const category = await prisma.userCategory.create({
      data: { userId, name: trimmed, position: count },
    });
    return toCategory(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("已經有相同名稱的分類了");
    }
    throw err;
  }
}

export async function addUserSource(
  userId: string,
  input: { name: string; feedUrl: string; categoryId: string },
): Promise<Source> {
  const name = input.name.trim();
  const inputUrl = input.feedUrl.trim();
  if (!name) throw new Error("網站名稱不能是空的");
  if (!inputUrl) throw new Error("網址不能是空的");

  const category = await prisma.userCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || category.userId !== userId) {
    throw new NotFoundError("找不到這個分類");
  }

  // Some sites have no RSS/Atom feed at all and are handled by a dedicated HTML
  // adapter instead (see src/lib/adapters) — checked first, same as the legacy store.
  const htmlMatch = matchHtmlSourceAdapter(inputUrl);

  let feedUrl: string;
  let homepage: string;
  let normalizedUrlKey: string;
  let extraFields: { type: "rss" | "html"; adapter?: string | null; pageUrl?: string | null } = { type: "rss" };

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
    normalizedUrlKey = normalizeUrl(htmlMatch.homepage);
    extraFields = { type: "html", adapter: htmlMatch.adapter, pageUrl: htmlMatch.pageUrl };
  } else {
    const discovery = await discoverFeed(inputUrl);
    if (!discovery.ok) throw new Error(discovery.error);
    feedUrl = discovery.feedUrl;

    const validation = await validateFeedUrl(feedUrl);
    if (!validation.ok) throw new Error(validation.error);

    homepage = feedUrl;
    try {
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
    normalizedUrlKey = normalizeUrl(homepage);
  }

  // Look up an existing global Source first — two users adding the "same" site
  // must never create two Source rows, only two separate Subscription rows.
  const source = await prisma.source.upsert({
    where: { normalizedUrl: normalizedUrlKey },
    update: {},
    create: {
      name,
      homepage,
      normalizedUrl: normalizedUrlKey,
      feedUrl,
      type: extraFields.type,
      adapter: extraFields.adapter ?? null,
      pageUrl: extraFields.pageUrl ?? null,
      createdByUserId: userId,
    },
  });

  try {
    const subscription = await prisma.subscription.create({
      data: { userId, sourceId: source.id, categoryId: input.categoryId },
      include: { source: true },
    });
    return toSource(subscription);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(htmlMatch ? "已經關注這個新聞來源了" : "這個新聞來源已經加入過了");
    }
    throw err;
  }
}

/** Deletes the current user's Subscription only — the global Source row (and
 *  any other user's Subscription to it) is never touched. */
export async function removeUserSource(userId: string, sourceId: string): Promise<void> {
  const result = await prisma.subscription.deleteMany({ where: { userId, sourceId } });
  if (result.count === 0) throw new NotFoundError("找不到這個網站來源");
}

export async function removeUserCategory(
  userId: string,
  categoryId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const category = await prisma.userCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.userId !== userId) throw new NotFoundError("找不到這個分類");

  const subCount = await prisma.subscription.count({ where: { userId, categoryId } });
  if (subCount > 0 && !options.force) {
    throw new CategoryNotEmptyError(subCount);
  }

  // Deleting the category cascades to this user's Subscription rows in it
  // (Subscription.categoryId is onDelete: SetNull, so delete them explicitly
  // first to match the legacy behavior of removing sources with their category).
  await prisma.$transaction([
    prisma.subscription.deleteMany({ where: { userId, categoryId } }),
    prisma.userCategory.delete({ where: { id: categoryId } }),
  ]);
}

/**
 * Sets the user's work-category preference and/or onboarding completion.
 * `professionKey` is used only to pick which recommendation catalog to show —
 * it never creates a Subscription by itself.
 */
export async function updateUserPreferences(
  userId: string,
  input: { professionKey?: string | null; customProfession?: string | null; onboardingCompleted?: boolean },
): Promise<void> {
  if (input.professionKey != null && input.professionKey !== "" && !isKnownProfessionKey(input.professionKey)) {
    throw new Error("未知的工作類別");
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.professionKey !== undefined ? { professionKey: input.professionKey } : {}),
      ...(input.customProfession !== undefined ? { customProfession: input.customProfession } : {}),
      ...(input.onboardingCompleted !== undefined ? { onboardingCompleted: input.onboardingCompleted } : {}),
    },
  });
}

/** A curated/searchable catalog entry, richer than the legacy `Source` shape
 *  (used by the "精選來源" / "搜尋全部來源" UI, not the live homepage). */
export interface CatalogSourceCard {
  id: string;
  name: string;
  homepage: string;
  feedUrl: string | null;
  connectorType: string;
  provider: string;
  language: string | null;
  country: string | null;
  accessType: string;
  contentType: string;
  peerReviewed: boolean | null;
  preprint: boolean | null;
  verificationStatus: string;
  verificationNote: string | null;
  professions: string[];
  alreadySubscribed: boolean;
}

async function toCatalogCards(
  sources: Array<{
    id: string;
    name: string;
    homepage: string;
    feedUrl: string | null;
    connectorType: string;
    provider: string;
    language: string | null;
    country: string | null;
    accessType: string;
    contentType: string;
    peerReviewed: boolean | null;
    preprint: boolean | null;
    verificationStatus: string;
    verificationNote: string | null;
    professions: { professionKey: string }[];
  }>,
  userId: string,
): Promise<CatalogSourceCard[]> {
  const subscribedSourceIds = await prisma.subscription.findMany({ where: { userId }, select: { sourceId: true } });
  const subscribed = new Set(subscribedSourceIds.map((s) => s.sourceId));

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    homepage: s.homepage,
    feedUrl: s.feedUrl,
    connectorType: s.connectorType,
    provider: s.provider,
    language: s.language,
    country: s.country,
    accessType: s.accessType,
    contentType: s.contentType,
    peerReviewed: s.peerReviewed,
    preprint: s.preprint,
    verificationStatus: s.verificationStatus,
    verificationNote: s.verificationNote,
    professions: s.professions.map((p) => p.professionKey),
    alreadySubscribed: subscribed.has(s.id),
  }));
}

const CATALOG_CARD_SELECT = {
  id: true,
  name: true,
  homepage: true,
  feedUrl: true,
  connectorType: true,
  provider: true,
  language: true,
  country: true,
  accessType: true,
  contentType: true,
  peerReviewed: true,
  preprint: true,
  verificationStatus: true,
  verificationNote: true,
  professions: { select: { professionKey: true } },
} as const;

/** Recommended (curated + active) sources for a profession. Includes sources
 *  the user already follows (flagged via `alreadySubscribed`) so the UI can
 *  offer an unfollow action instead of just disappearing them — callers that
 *  want an "unfollowed only" view (e.g. first-run onboarding) filter on
 *  `alreadySubscribed` themselves. Every profession uses this exact same
 *  query; there is no special-cased "medical" path. Empty (not fabricated)
 *  for professions with no curated entries yet. */
export async function getRecommendedSources(userId: string, professionKey: string | null): Promise<CatalogSourceCard[]> {
  if (!professionKey || !isKnownProfessionKey(professionKey)) return [];

  const sources = await prisma.source.findMany({
    where: {
      active: true,
      catalogStatus: "curated",
      professions: { some: { professionKey } },
    },
    select: CATALOG_CARD_SELECT,
  });

  return toCatalogCards(sources, userId);
}

/** Returns one verified catalog source in the same shape used by the feed
 * fetcher. Preview is deliberately limited to curated + active sources so a
 * caller cannot use this endpoint to probe another user's private submission. */
export async function getCuratedSourceForPreview(sourceId: string): Promise<Source | null> {
  const source = await prisma.source.findFirst({
    where: { id: sourceId, active: true, catalogStatus: "curated" },
  });
  return source ? toSource({ categoryId: "catalog-preview", source }) : null;
}

/**
 * "搜尋全部來源" — searches the curated catalog across every profession, not
 * just the caller's own. Only ever returns catalogStatus=curated, active=true
 * sources; a user's self-added source never appears here for anyone else.
 */
export async function searchCatalog(
  userId: string,
  filters: {
    query?: string;
    professionKey?: string;
    language?: string;
    country?: string;
    contentType?: string;
    accessType?: string;
  },
): Promise<CatalogSourceCard[]> {
  const query = filters.query?.trim();
  const sources = await prisma.source.findMany({
    where: {
      active: true,
      catalogStatus: "curated",
      ...(filters.professionKey ? { professions: { some: { professionKey: filters.professionKey } } } : {}),
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.contentType ? { contentType: filters.contentType as never } : {}),
      ...(filters.accessType ? { accessType: filters.accessType as never } : {}),
      ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
    },
    select: CATALOG_CARD_SELECT,
    take: 50,
  });

  return toCatalogCards(sources, userId);
}

/**
 * Turns an already-previewed discovery candidate (see src/lib/connectors) into
 * a real Source (upserted by normalizedUrl, catalogStatus defaults to
 * "user_added" so it never leaks into other users' recommendations/search)
 * plus the current user's Subscription. Does NOT re-run discovery — the
 * candidate was already validated by the preview step.
 */
export async function addSourceFromCandidate(
  userId: string,
  candidate: SourceCandidate,
  categoryId: string,
): Promise<Source> {
  const category = await prisma.userCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.userId !== userId) {
    throw new NotFoundError("找不到這個分類");
  }

  const homepage = stripTrackingParams(candidate.homepage);
  // API-provider candidates (Crossref/Europe PMC/PubMed) share one generic
  // homepage across every query, so normalizedUrl (which must be unique) is
  // derived from provider+query instead — otherwise two different searches
  // against the same provider would collide on the same Source row.
  const normalizedUrlKey =
    candidate.connectorType === "api"
      ? `${candidate.provider}:query:${JSON.stringify(candidate.connectorConfig ?? {})}`.toLowerCase()
      : normalizeUrl(homepage);

  const source = await prisma.source.upsert({
    where: { normalizedUrl: normalizedUrlKey },
    update: {},
    create: {
      name: candidate.name,
      homepage,
      normalizedUrl: normalizedUrlKey,
      feedUrl: candidate.feedUrl ?? null,
      type: candidate.connectorType === "html_adapter" ? "html" : "rss",
      connectorType: candidate.connectorType,
      provider: candidate.provider,
      connectorConfig: candidate.connectorConfig ? (candidate.connectorConfig as Prisma.InputJsonValue) : undefined,
      adapter: candidate.connectorType === "html_adapter" ? candidate.provider : null,
      pageUrl: candidate.connectorType === "html_adapter" ? candidate.feedUrl : null,
      accessType: candidate.accessType ?? "unknown",
      contentType: candidate.contentType ?? "other",
      language: candidate.language ?? null,
      country: candidate.country ?? null,
      catalogStatus: "user_added",
      createdByUserId: userId,
    },
  });

  try {
    const subscription = await prisma.subscription.create({
      data: { userId, sourceId: source.id, categoryId },
      include: { source: true },
    });
    return toSource(subscription);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConnectorError("DUPLICATE_SUBSCRIPTION", "已經關注這個新聞來源了");
    }
    throw err;
  }
}

/**
 * Subscribes the user to an already-known (seeded/global) recommended Source
 * — no re-discovery needed, it's already in the catalog. Requires explicit
 * user confirmation at the call site; never invoked automatically. Creates
 * (or reuses) a UserCategory named after the profession to hold it, since a
 * brand-new user has no categories yet.
 */
export async function followRecommendedSource(
  userId: string,
  sourceId: string,
  categoryName: string,
): Promise<Source> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  // Only a curated + active Source may be followed through this recommendation
  // API — user_added/pending/rejected/inactive are rejected the same way as
  // "not found" (never reveals whether a non-curated Source exists or who
  // owns it), matching how any other unauthorized-resource lookup behaves.
  if (!source || source.catalogStatus !== "curated" || !source.active) {
    throw new NotFoundError("找不到這個新聞來源");
  }

  const trimmedCategoryName = categoryName.trim() || "我的新聞";
  let category = await prisma.userCategory.findFirst({ where: { userId, name: trimmedCategoryName } });
  if (!category) {
    const count = await prisma.userCategory.count({ where: { userId } });
    category = await prisma.userCategory.create({ data: { userId, name: trimmedCategoryName, position: count } });
  }

  try {
    const subscription = await prisma.subscription.create({
      data: { userId, sourceId, categoryId: category.id },
      include: { source: true },
    });
    return toSource(subscription);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("已經關注這個新聞來源了");
    }
    throw err;
  }
}
