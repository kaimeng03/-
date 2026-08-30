import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("@/lib/sourceStore", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sourceStore")>("@/lib/sourceStore");
  return {
    ...actual,
    readLegacySourcesJsonFile: vi.fn(async () => ({
      categories: [{ id: "architecture-news", name: "建築新聞" }],
      sources: [
        {
          id: "archdaily",
          name: "ArchDaily",
          homepage: "https://legacy-import-test.example.com",
          feedUrl: "https://legacy-import-test.example.com/rss",
          categoryId: "architecture-news",
        },
      ],
    })),
  };
});

import { prisma } from "./prisma";
import {
  isLegacyOwner,
  getLegacySourcesImportStatus,
  importLegacySources,
  importLocalReadState,
  getLegacyReadStateImportStatus,
  LOCAL_READ_STATE_MAX_ITEMS,
} from "./legacyImport";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describe("isLegacyOwner", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when LEGACY_OWNER_EMAIL is not set, regardless of email", () => {
    vi.stubEnv("LEGACY_OWNER_EMAIL", "");
    expect(isLegacyOwner("anyone@example.com")).toBe(false);
  });

  it("matches case-insensitively and trims whitespace", () => {
    vi.stubEnv("LEGACY_OWNER_EMAIL", " Owner@Example.com ");
    expect(isLegacyOwner("owner@example.com")).toBe(true);
  });

  it("rejects a non-matching email", () => {
    vi.stubEnv("LEGACY_OWNER_EMAIL", "owner@example.com");
    expect(isLegacyOwner("someone-else@example.com")).toBe(false);
  });
});

describeDb("legacy sources import — real Postgres", () => {
  let owner: { id: string; email: string };
  let other: { id: string; email: string };

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ["legacy-owner@test.local", "legacy-other@test.local"] } } });
    owner = await prisma.user.create({ data: { email: "legacy-owner@test.local", name: "Owner" } });
    other = await prisma.user.create({ data: { email: "legacy-other@test.local", name: "Other" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.source.deleteMany({ where: { normalizedUrl: "https://legacy-import-test.example.com" } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.stubEnv("LEGACY_OWNER_EMAIL", "legacy-owner@test.local");
  });

  it("a non-owner cannot import, even with a trusted session", async () => {
    await expect(importLegacySources(other.id, other.email)).rejects.toThrow("沒有權限匯入舊版資料");
    const status = await getLegacySourcesImportStatus(other.id, other.email);
    expect(status.eligible).toBe(false);
  });

  it("the owner sees a preview before importing", async () => {
    const status = await getLegacySourcesImportStatus(owner.id, owner.email);
    expect(status.eligible).toBe(true);
    expect(status.alreadyImported).toBe(false);
    expect(status.preview).toEqual({ categoryCount: 1, sourceCount: 1 });
  });

  it("importing creates the owner's own category + subscription, and is idempotent on repeat runs", async () => {
    const first = await importLegacySources(owner.id, owner.email);
    expect(first.importedCategories).toBe(1);
    expect(first.importedSubscriptions).toBe(1);

    // Re-running (simulating a retry) must be a safe no-op — legacySourcesImportedAt
    // is already set, so it should short-circuit rather than create duplicates.
    const second = await importLegacySources(owner.id, owner.email);
    expect(second.alreadyImported).toBe(true);
    expect(second.importedCategories).toBe(0);

    const categories = await prisma.userCategory.findMany({ where: { userId: owner.id, name: "建築新聞" } });
    expect(categories).toHaveLength(1);
    const subs = await prisma.subscription.count({ where: { userId: owner.id } });
    expect(subs).toBe(1);
  });

  it("never touches another user's categories or subscriptions", async () => {
    const otherCategories = await prisma.userCategory.count({ where: { userId: other.id } });
    const otherSubs = await prisma.subscription.count({ where: { userId: other.id } });
    expect(otherCategories).toBe(0);
    expect(otherSubs).toBe(0);
  });
});

describeDb("legacy localStorage read-state import — real Postgres", () => {
  let user: { id: string };
  const ID1 = "1".repeat(32);
  const ID2 = "2".repeat(32);

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: "legacy-readstate@test.local" } });
    user = await prisma.user.create({ data: { email: "legacy-readstate@test.local", name: "Reader" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it("rejects malformed input without writing anything", async () => {
    const result = await importLocalReadState(user.id, { read: "not-an-array", saved: [] });
    expect(result.ok).toBe(false);
    const status = await getLegacyReadStateImportStatus(user.id);
    expect(status.alreadyImported).toBe(false);
  });

  it("rejects an oversized payload", async () => {
    const tooMany = Array.from({ length: LOCAL_READ_STATE_MAX_ITEMS + 1 }, (_, i) => i.toString(16).padStart(32, "0"));
    const result = await importLocalReadState(user.id, { read: tooMany, saved: [] });
    expect(result.ok).toBe(false);
  });

  it("silently drops malformed ids and imports the valid ones, then marks itself done (idempotent)", async () => {
    const result = await importLocalReadState(user.id, { read: [ID1, "garbage"], saved: [ID2] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.imported).toBe(2);

    const status = await getLegacyReadStateImportStatus(user.id);
    expect(status.alreadyImported).toBe(true);

    // Re-running with the same data must not error or duplicate rows.
    const again = await importLocalReadState(user.id, { read: [ID1], saved: [ID2] });
    expect(again.ok).toBe(true);

    const rows = await prisma.articleState.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(2);
  });
});
