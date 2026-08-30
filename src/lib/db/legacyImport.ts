import { prisma } from "./prisma";
import { readLegacySourcesJsonFile } from "@/lib/sourceStore";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { ARTICLE_ID_PATTERN } from "@/lib/db/articleState";

/** Only the user whose Google-account email matches LEGACY_OWNER_EMAIL may
 *  import data/sources.json — this is never hardcoded in the repo. */
export function isLegacyOwner(email: string | null | undefined): boolean {
  const owner = process.env.LEGACY_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}

export async function getLegacySourcesImportStatus(userId: string, email: string | null | undefined) {
  const eligible = isLegacyOwner(email);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { legacySourcesImportedAt: true } });
  const alreadyImported = user?.legacySourcesImportedAt != null;

  if (!eligible || alreadyImported) {
    return { eligible, alreadyImported, preview: null as { categoryCount: number; sourceCount: number } | null };
  }

  const config = await readLegacySourcesJsonFile();
  return {
    eligible,
    alreadyImported,
    preview: { categoryCount: config.categories.length, sourceCount: config.sources.length },
  };
}

/**
 * Idempotent: upserts Source rows by normalizedUrl, finds-or-creates the
 * user's own UserCategory per legacy category name, and skips a Subscription
 * that already exists (unique(userId, sourceId)). Re-running this after a
 * partial or full prior run creates no duplicates. Never touches other
 * users' categories or subscriptions.
 */
export async function importLegacySources(userId: string, email: string | null | undefined) {
  if (!isLegacyOwner(email)) {
    throw new Error("沒有權限匯入舊版資料");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.legacySourcesImportedAt) {
    return { importedCategories: 0, importedSubscriptions: 0, alreadyImported: true };
  }

  const config = await readLegacySourcesJsonFile();
  const legacyIdToCategoryName = new Map(config.categories.map((c) => [c.id, c.name]));

  let importedCategories = 0;
  let importedSubscriptions = 0;

  for (const legacySource of config.sources) {
    const categoryName = legacyIdToCategoryName.get(legacySource.categoryId);
    if (!categoryName) continue;

    let category = await prisma.userCategory.findFirst({ where: { userId, name: categoryName } });
    if (!category) {
      const count = await prisma.userCategory.count({ where: { userId } });
      category = await prisma.userCategory.create({ data: { userId, name: categoryName, position: count } });
      importedCategories++;
    }

    const normalizedUrl = normalizeUrl(legacySource.homepage);
    const source = await prisma.source.upsert({
      where: { normalizedUrl },
      update: {},
      create: {
        name: legacySource.name,
        homepage: legacySource.homepage,
        normalizedUrl,
        feedUrl: legacySource.feedUrl || null,
        type: legacySource.type === "html" ? "html" : "rss",
        adapter: legacySource.adapter || null,
        pageUrl: legacySource.pageUrl || null,
      },
    });

    const existingSub = await prisma.subscription.findUnique({
      where: { userId_sourceId: { userId, sourceId: source.id } },
    });
    if (!existingSub) {
      await prisma.subscription.create({ data: { userId, sourceId: source.id, categoryId: category.id } });
      importedSubscriptions++;
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { legacySourcesImportedAt: new Date() } });
  return { importedCategories, importedSubscriptions, alreadyImported: false };
}

export const LOCAL_READ_STATE_MAX_ITEMS = 3000;

/**
 * Idempotent (upserts by (userId, articleId), same as normal state writes).
 * Rejects malformed input outright rather than partially applying it, so a
 * failed import never corrupts state — and the caller's original
 * localStorage data is untouched either way (this never deletes anything
 * client-side).
 */
export async function importLocalReadState(
  userId: string,
  input: { read: unknown; saved: unknown },
): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  if (!Array.isArray(input.read) || !Array.isArray(input.saved)) {
    return { ok: false, error: "格式不正確" };
  }
  if (input.read.length > LOCAL_READ_STATE_MAX_ITEMS || input.saved.length > LOCAL_READ_STATE_MAX_ITEMS) {
    return { ok: false, error: "資料筆數過多" };
  }
  const read: string[] = input.read.filter((id): id is string => typeof id === "string" && ARTICLE_ID_PATTERN.test(id));
  const saved: string[] = input.saved.filter((id): id is string => typeof id === "string" && ARTICLE_ID_PATTERN.test(id));

  const ids = new Set([...read, ...saved]);
  const readSet = new Set(read);
  const savedSet = new Set(saved);

  const now = new Date();
  await prisma.$transaction(
    [...ids].map((articleId) =>
      prisma.articleState.upsert({
        where: { userId_articleId: { userId, articleId } },
        update: {
          ...(readSet.has(articleId) ? { readAt: now } : {}),
          ...(savedSet.has(articleId) ? { savedAt: now } : {}),
        },
        create: {
          userId,
          articleId,
          readAt: readSet.has(articleId) ? now : null,
          savedAt: savedSet.has(articleId) ? now : null,
        },
      }),
    ),
  );

  await prisma.user.update({ where: { id: userId }, data: { legacyReadStateImportedAt: now } });
  return { ok: true, imported: ids.size };
}

export async function getLegacyReadStateImportStatus(userId: string): Promise<{ alreadyImported: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { legacyReadStateImportedAt: true } });
  return { alreadyImported: user?.legacyReadStateImportedAt != null };
}
