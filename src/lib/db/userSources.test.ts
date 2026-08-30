import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Real network discovery/validation is mocked — these tests exercise the real
// Prisma/Postgres data layer (isolation, dedup, ownership), not feed parsing.
vi.mock("@/lib/feedDiscovery", () => ({
  discoverFeed: vi.fn(async (url: string) => ({ ok: true, feedUrl: `${url.replace(/\/$/, "")}/rss/` })),
}));
vi.mock("@/lib/sourceStore", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sourceStore")>("@/lib/sourceStore");
  return { ...actual, validateFeedUrl: vi.fn(async () => ({ ok: true })) };
});
// fetchAllArticles now genuinely dispatches API-provider sources to their
// connector (see src/lib/feeds.ts) — mocked here so this real-Postgres test
// never calls the live Crossref API.
vi.mock("@/lib/connectors/crossref", () => ({
  fetchCrossrefArticles: vi.fn(async () => [
    {
      id: "crossref:10.1/test",
      title: "Mocked Crossref Article",
      summary: null,
      canonicalUrl: "https://doi.org/10.1/test",
      source: "Mock Journal",
      authors: [],
      publishedAt: "2024-01-01T00:00:00.000Z",
      thumbnail: null,
      doi: "10.1/test",
      pmid: null,
      language: null,
      accessType: "unknown",
      peerReviewed: true,
      preprint: false,
    },
  ]),
}));

import { prisma } from "./prisma";
import {
  getUserSourcesConfig,
  addUserCategory,
  addUserSource,
  removeUserSource,
  removeUserCategory,
  getRecommendedSources,
  followRecommendedSource,
  searchCatalog,
  addSourceFromCandidate,
} from "./userSources";
import { NotFoundError, CategoryNotEmptyError } from "@/lib/sourceStore";
import { ConnectorError } from "@/lib/connectors/errors";
import type { SourceCandidate } from "@/lib/connectors/types";
import { fetchAllArticles } from "@/lib/feeds";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

if (!hasDb) {
  console.warn(
    "Skipping src/lib/db/userSources.test.ts — DATABASE_URL is not set. " +
      "Run `npx prisma dev` and set DATABASE_URL to include these in a full run.",
  );
}

describeDb("userSources — multi-user data isolation (real Postgres)", () => {
  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ["iso-a@test.local", "iso-b@test.local"] } } });
    userA = await prisma.user.create({ data: { email: "iso-a@test.local", name: "Isolation A" } });
    userB = await prisma.user.create({ data: { email: "iso-b@test.local", name: "Isolation B" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.source.deleteMany({ where: { normalizedUrl: "https://iso-test.example.com" } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a brand-new user's homepage starts completely empty — no auto-subscribe", async () => {
    const config = await getUserSourcesConfig(userA.id);
    expect(config.categories).toHaveLength(0);
    expect(config.sources).toHaveLength(0);
  });

  it("user A adding a source is invisible to user B until B subscribes too", async () => {
    const catA = await addUserCategory(userA.id, "Isolation Test Category");
    await addUserSource(userA.id, {
      name: "Iso Test Source",
      feedUrl: "https://iso-test.example.com",
      categoryId: catA.id,
    });

    const viewB = await getUserSourcesConfig(userB.id);
    expect(viewB.sources).toHaveLength(0);
    expect(viewB.categories.some((c) => c.name === "Isolation Test Category")).toBe(false);
  });

  it("two users subscribing to the same URL share one Source row but get separate Subscriptions", async () => {
    const catB = await addUserCategory(userB.id, "B's Category");
    const sourceB = await addUserSource(userB.id, {
      name: "Iso Test Source (B)",
      feedUrl: "https://iso-test.example.com",
      categoryId: catB.id,
    });

    const rowCount = await prisma.source.count({ where: { normalizedUrl: "https://iso-test.example.com" } });
    expect(rowCount).toBe(1);

    const viewA = await getUserSourcesConfig(userA.id);
    const sourceA = viewA.sources.find((s) => s.homepage === "https://iso-test.example.com");
    expect(sourceA?.id).toBe(sourceB.id);
  });

  it("user A unfollowing does not affect user B's subscription to the same Source", async () => {
    const viewABefore = await getUserSourcesConfig(userA.id);
    const sourceId = viewABefore.sources[0].id;

    await removeUserSource(userA.id, sourceId);

    const viewAAfter = await getUserSourcesConfig(userA.id);
    const viewBAfter = await getUserSourcesConfig(userB.id);
    expect(viewAAfter.sources).toHaveLength(0);
    expect(viewBAfter.sources).toHaveLength(1);

    const sourceRow = await prisma.source.findUnique({ where: { id: sourceId } });
    expect(sourceRow).not.toBeNull();
  });

  it("user A cannot delete user B's category — rejected, not silently ignored", async () => {
    const viewB = await getUserSourcesConfig(userB.id);
    const categoryIdOfB = viewB.categories[0].id;

    await expect(removeUserCategory(userA.id, categoryIdOfB, { force: true })).rejects.toBeInstanceOf(NotFoundError);

    const stillExists = await prisma.userCategory.findUnique({ where: { id: categoryIdOfB } });
    expect(stillExists).not.toBeNull();
  });

  it("user A cannot remove user B's subscription via a guessed sourceId", async () => {
    const viewB = await getUserSourcesConfig(userB.id);
    const sourceIdOfB = viewB.sources[0].id;

    await expect(removeUserSource(userA.id, sourceIdOfB)).rejects.toBeInstanceOf(NotFoundError);

    const viewBAfter = await getUserSourcesConfig(userB.id);
    expect(viewBAfter.sources).toHaveLength(1);
  });

  it("deleting a non-empty category without force throws CategoryNotEmptyError and changes nothing", async () => {
    const viewB = await getUserSourcesConfig(userB.id);
    const categoryIdOfB = viewB.categories[0].id;

    await expect(removeUserCategory(userB.id, categoryIdOfB, {})).rejects.toBeInstanceOf(CategoryNotEmptyError);

    const viewBAfter = await getUserSourcesConfig(userB.id);
    expect(viewBAfter.sources).toHaveLength(1);
    expect(viewBAfter.categories).toHaveLength(1);
  });

  it("force-deleting the last subscriber's category removes the Subscription but never the global Source", async () => {
    const viewB = await getUserSourcesConfig(userB.id);
    const categoryIdOfB = viewB.categories[0].id;

    await removeUserCategory(userB.id, categoryIdOfB, { force: true });

    const viewBAfter = await getUserSourcesConfig(userB.id);
    expect(viewBAfter.categories).toHaveLength(0);
    expect(viewBAfter.sources).toHaveLength(0);

    const sourceRow = await prisma.source.findUnique({ where: { normalizedUrl: "https://iso-test.example.com" } });
    expect(sourceRow).not.toBeNull();
  });

  it("category names cannot unreasonably duplicate within one user", async () => {
    await addUserCategory(userA.id, "Duplicate Name Test");
    await expect(addUserCategory(userA.id, "Duplicate Name Test")).rejects.toThrow();
  });

  it("but the same category name IS allowed across different users", async () => {
    await expect(addUserCategory(userB.id, "Duplicate Name Test")).resolves.toBeDefined();
  });
});

describeDb("userSources — curated catalog (real Postgres)", () => {
  let user: { id: string };
  let otherUser: { id: string };
  const CURATED_URL = "https://catalog-test.example.com";

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ["catalog-a@test.local", "catalog-b@test.local"] } } });
    user = await prisma.user.create({ data: { email: "catalog-a@test.local", name: "Catalog A" } });
    otherUser = await prisma.user.create({ data: { email: "catalog-b@test.local", name: "Catalog B" } });

    const source = await prisma.source.create({
      data: {
        name: "Catalog Test Source",
        homepage: CURATED_URL,
        normalizedUrl: CURATED_URL,
        feedUrl: `${CURATED_URL}/rss`,
        catalogStatus: "curated",
        verificationStatus: "verified",
        active: true,
      },
    });
    await prisma.professionSource.create({ data: { sourceId: source.id, professionKey: "tech" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });
    await prisma.source.deleteMany({
      where: {
        OR: [
          { normalizedUrl: { in: [CURATED_URL, "https://user-added-test.example.com"] } },
          { connectorType: "api" },
        ],
      },
    });
    await prisma.$disconnect();
  });

  it("every profession uses the exact same recommendation query — a curated tech source shows up for tech", async () => {
    const recs = await getRecommendedSources(user.id, "tech");
    expect(recs.some((r) => r.homepage === CURATED_URL)).toBe(true);
  });

  it("an unknown profession key returns an empty (not fabricated) list", async () => {
    const recs = await getRecommendedSources(user.id, "not-a-real-profession");
    expect(recs).toEqual([]);
  });

  it("followRecommendedSource rejects a user_added source (not curated)", async () => {
    const userAdded = await prisma.source.create({
      data: { name: "User Added", homepage: "https://not-curated-test.example.com", normalizedUrl: "https://not-curated-test.example.com", catalogStatus: "user_added", active: true },
    });
    await expect(followRecommendedSource(user.id, userAdded.id, "x")).rejects.toBeInstanceOf(NotFoundError);
    await prisma.source.delete({ where: { id: userAdded.id } });
  });

  it("followRecommendedSource rejects an inactive curated source", async () => {
    const inactive = await prisma.source.create({
      data: { name: "Inactive", homepage: "https://inactive-test.example.com", normalizedUrl: "https://inactive-test.example.com", catalogStatus: "curated", active: false },
    });
    await expect(followRecommendedSource(user.id, inactive.id, "x")).rejects.toBeInstanceOf(NotFoundError);
    await prisma.source.delete({ where: { id: inactive.id } });
  });

  it("followRecommendedSource rejects a nonexistent sourceId", async () => {
    await expect(followRecommendedSource(user.id, "nonexistent-id", "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("one-click follow creates a Subscription and the source is flagged alreadySubscribed (still listed, so the UI can offer unfollow)", async () => {
    const recsBefore = await getRecommendedSources(user.id, "tech");
    const target = recsBefore.find((r) => r.homepage === CURATED_URL)!;
    expect(target.alreadySubscribed).toBe(false);

    await followRecommendedSource(user.id, target.id, "科技／軟體");

    const recsAfter = await getRecommendedSources(user.id, "tech");
    const afterFollow = recsAfter.find((r) => r.id === target.id);
    expect(afterFollow?.alreadySubscribed).toBe(true);

    const view = await getUserSourcesConfig(user.id);
    expect(view.sources.some((s) => s.id === target.id)).toBe(true);
  });

  it("following the same curated source twice is a clean DUPLICATE_SUBSCRIPTION, not a silent double-add", async () => {
    const view = await getUserSourcesConfig(user.id);
    const sourceId = view.sources.find((s) => s.homepage === CURATED_URL)!.id;

    await expect(followRecommendedSource(user.id, sourceId, "科技／軟體")).rejects.toThrow();
  });

  it("one-click unfollow removes only this user's Subscription, source stays curated", async () => {
    const view = await getUserSourcesConfig(user.id);
    const sourceId = view.sources.find((s) => s.homepage === CURATED_URL)!.id;

    await removeUserSource(user.id, sourceId);

    const viewAfter = await getUserSourcesConfig(user.id);
    expect(viewAfter.sources.some((s) => s.id === sourceId)).toBe(false);
    const stillCurated = await prisma.source.findUnique({ where: { id: sourceId } });
    expect(stillCurated?.catalogStatus).toBe("curated");
  });

  it("a user-added (non-curated) source never appears in recommendations or catalog search for anyone", async () => {
    const cat = await addUserCategory(otherUser.id, "User Added Category");
    const candidate: SourceCandidate = {
      provider: "generic",
      connectorType: "rss",
      name: "User Added Source",
      homepage: "https://user-added-test.example.com",
      feedUrl: "https://user-added-test.example.com/rss",
    };
    await addSourceFromCandidate(otherUser.id, candidate, cat.id);

    const searchResults = await searchCatalog(user.id, { query: "User Added Source" });
    expect(searchResults).toHaveLength(0);

    const recs = await getRecommendedSources(user.id, "tech");
    expect(recs.some((r) => r.name === "User Added Source")).toBe(false);
  });

  it("searchCatalog finds curated sources across every profession, not just the caller's own", async () => {
    const results = await searchCatalog(otherUser.id, { query: "Catalog Test" });
    expect(results.some((r) => r.homepage === CURATED_URL)).toBe(true);
  });

  it("addSourceFromCandidate rejects a categoryId the caller does not own", async () => {
    const catOfOther = await prisma.userCategory.findFirst({ where: { userId: otherUser.id } });
    const candidate: SourceCandidate = {
      provider: "generic",
      connectorType: "rss",
      name: "Should Not Be Created",
      homepage: "https://should-not-exist.example.com",
    };
    await expect(addSourceFromCandidate(user.id, candidate, catOfOther!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ConnectorError is a real Error subclass usable with instanceof across the API boundary", () => {
    const err = new ConnectorError("DUPLICATE_SUBSCRIPTION", "already following");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("DUPLICATE_SUBSCRIPTION");
  });

  it("an API-provider source (Crossref/Europe PMC/PubMed) produces real articles on the homepage fetch, dispatched by provider", async () => {
    const cat = await addUserCategory(user.id, "API Source Category");
    const candidate: SourceCandidate = {
      provider: "crossref",
      connectorType: "api",
      name: "Crossref: sustainable architecture",
      homepage: "https://api-provider-test.example.com",
      connectorConfig: { query: "sustainable architecture" },
    };
    const created = await addSourceFromCandidate(user.id, candidate, cat.id);
    expect(created.type).toBe("api");
    expect(created.provider).toBe("crossref");

    const config = await getUserSourcesConfig(user.id);
    const apiSource = config.sources.find((s) => s.id === created.id);
    expect(apiSource?.type).toBe("api");
    expect(apiSource?.provider).toBe("crossref");
    expect(apiSource?.connectorConfig).toEqual({ query: "sustainable architecture" });

    const result = await fetchAllArticles(config.sources);
    expect(result.failedSourceNames).not.toContain(candidate.name);
    const apiArticle = result.articles.find((a) => a.sourceId === created.id);
    expect(apiArticle?.titleEn).toBe("Mocked Crossref Article");
    expect(apiArticle?.link).toBe("https://doi.org/10.1/test");
  });

  it("an unrecognized provider fails loudly (not a silent empty result) when the homepage tries to fetch it, without affecting a good source fetched in the same batch", async () => {
    const cat = await addUserCategory(user.id, "Bad Provider Category");
    const goodCandidate: SourceCandidate = {
      provider: "crossref",
      connectorType: "api",
      name: "Good Crossref Source",
      homepage: "https://good-provider-test.example.com",
      connectorConfig: { query: "good query" },
    };
    const badCandidate: SourceCandidate = {
      provider: "not-a-real-provider",
      connectorType: "api",
      name: "Bad Provider Source",
      homepage: "https://bad-provider-test.example.com",
      connectorConfig: { query: "x" },
    };
    const good = await addSourceFromCandidate(user.id, goodCandidate, cat.id);
    const bad = await addSourceFromCandidate(user.id, badCandidate, cat.id);

    const config = await getUserSourcesConfig(user.id);
    const result = await fetchAllArticles(config.sources.filter((s) => s.id === good.id || s.id === bad.id));
    expect(result.failedSourceNames).toContain(badCandidate.name);
    expect(result.failedSourceNames).not.toContain(goodCandidate.name);
    expect(result.articles.some((a) => a.sourceId === good.id)).toBe(true);
  });

  it("invalid connectorConfig (missing query) fails loudly rather than silently returning no articles", async () => {
    const cat = await addUserCategory(user.id, "Invalid Config Category");
    const candidate: SourceCandidate = {
      provider: "crossref",
      connectorType: "api",
      name: "Invalid Config Source",
      homepage: "https://invalid-config-test.example.com",
      connectorConfig: {},
    };
    const created = await addSourceFromCandidate(user.id, candidate, cat.id);

    const config = await getUserSourcesConfig(user.id);
    const result = await fetchAllArticles(config.sources.filter((s) => s.id === created.id));
    expect(result.failedSourceNames).toContain(candidate.name);
  });
});
