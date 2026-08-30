import { prisma } from "./prisma";

/** Article IDs are always a 32-char lowercase hex md5 hash — see src/lib/feeds.ts
 *  (makeId) and src/lib/adapters/twarchitect.ts. Anything else is rejected rather
 *  than trusted, since these ids ultimately come from client-supplied requests. */
export const ARTICLE_ID_PATTERN = /^[a-f0-9]{32}$/;

export const MARK_ALL_READ_BATCH_LIMIT = 500;

export async function getArticleStates(userId: string): Promise<{ read: string[]; saved: string[] }> {
  const rows = await prisma.articleState.findMany({
    where: { userId, OR: [{ readAt: { not: null } }, { savedAt: { not: null } }] },
    select: { articleId: true, readAt: true, savedAt: true },
  });
  return {
    read: rows.filter((r) => r.readAt !== null).map((r) => r.articleId),
    saved: rows.filter((r) => r.savedAt !== null).map((r) => r.articleId),
  };
}

export async function setArticleState(
  userId: string,
  articleId: string,
  update: { read?: boolean; saved?: boolean },
): Promise<void> {
  if (!ARTICLE_ID_PATTERN.test(articleId)) {
    throw new Error("無效的文章 ID");
  }
  const readAt = update.read === undefined ? undefined : update.read ? new Date() : null;
  const savedAt = update.saved === undefined ? undefined : update.saved ? new Date() : null;

  await prisma.articleState.upsert({
    where: { userId_articleId: { userId, articleId } },
    update: { ...(readAt !== undefined ? { readAt } : {}), ...(savedAt !== undefined ? { savedAt } : {}) },
    create: { userId, articleId, readAt: readAt ?? null, savedAt: savedAt ?? null },
  });
}

export async function markAllRead(userId: string, articleIds: string[]): Promise<number> {
  const validIds = [...new Set(articleIds)].filter((id) => ARTICLE_ID_PATTERN.test(id)).slice(0, MARK_ALL_READ_BATCH_LIMIT);
  if (validIds.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction(
    validIds.map((articleId) =>
      prisma.articleState.upsert({
        where: { userId_articleId: { userId, articleId } },
        update: { readAt: now },
        create: { userId, articleId, readAt: now, savedAt: null },
      }),
    ),
  );
  return validIds.length;
}
