import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "../src/lib/db/prisma";
import { normalizeUrl } from "../src/lib/normalizeUrl";
import type { SourcesConfig } from "../src/lib/sources";
import { PROFESSIONS } from "../src/lib/professions";

interface CatalogEntry {
  name: string;
  homepage: string;
  feedUrl: string;
  connectorType: "rss" | "atom" | "api" | "sitemap" | "html_adapter";
  provider: string;
  language: string | null;
  country: string | null;
  contentType: string;
  accessType: string;
  verificationNote: string;
}

interface CatalogFile {
  profession: string;
  sources: CatalogEntry[];
}

/**
 * Idempotent Source catalog seed. Upserts by normalizedUrl so re-running never
 * creates duplicates. Deliberately does NOT create any UserCategory or
 * Subscription rows — recommended sources must never auto-subscribe anyone.
 *
 * Two inputs, two different purposes:
 *  - data/sources.json: legacy migration input only (see src/lib/db/legacyImport.ts).
 *    Upserted here too so its Source rows exist and are dedupe-safe, but
 *    WITHOUT touching catalogStatus — a legacy source is not automatically
 *    "curated" just by being seeded.
 *  - data/catalog/<profession>.json: the actual curated/recommended catalog,
 *    one file per profession, every entry hand-verified against the real
 *    official site/RSS/API before being added (see each file's
 *    verificationNote). Every profession uses the exact same seeding logic —
 *    no profession is special-cased.
 */
async function seedLegacySourcesJson() {
  const raw = await fs.readFile(path.join(process.cwd(), "data", "sources.json"), "utf-8");
  const config = JSON.parse(raw) as SourcesConfig;

  for (const source of config.sources) {
    const normalizedUrl = normalizeUrl(source.homepage);
    const type = source.type === "html" ? "html" : "rss";

    await prisma.source.upsert({
      where: { normalizedUrl },
      update: {
        name: source.name,
        homepage: source.homepage,
        feedUrl: source.feedUrl || null,
        type,
        pageUrl: source.pageUrl || null,
        adapter: source.adapter || null,
      },
      create: {
        name: source.name,
        homepage: source.homepage,
        normalizedUrl,
        feedUrl: source.feedUrl || null,
        type,
        pageUrl: source.pageUrl || null,
        adapter: source.adapter || null,
        createdByUserId: null,
      },
    });
    console.log(`Seeded legacy source: ${source.name}`);
  }
}

async function seedCatalog() {
  const catalogDir = path.join(process.cwd(), "data", "catalog");
  const knownKeys = new Set(PROFESSIONS.map((p) => p.key));

  let files: string[];
  try {
    files = (await fs.readdir(catalogDir)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("No data/catalog/ directory found — skipping curated catalog seed.");
    return;
  }

  for (const file of files) {
    const raw = await fs.readFile(path.join(catalogDir, file), "utf-8");
    const data = JSON.parse(raw) as CatalogFile;

    if (!knownKeys.has(data.profession)) {
      throw new Error(`data/catalog/${file}: unknown profession "${data.profession}" — not in src/lib/professions.ts`);
    }

    for (const entry of data.sources) {
      const normalizedUrl = normalizeUrl(entry.homepage);
      const type = entry.connectorType === "html_adapter" ? "html" : "rss";

      const source = await prisma.source.upsert({
        where: { normalizedUrl },
        update: {
          name: entry.name,
          homepage: entry.homepage,
          feedUrl: entry.feedUrl || null,
          type,
          connectorType: entry.connectorType,
          provider: entry.provider,
          language: entry.language,
          country: entry.country,
          contentType: entry.contentType as never,
          accessType: entry.accessType as never,
          adapter: entry.connectorType === "html_adapter" ? entry.provider : null,
          pageUrl: entry.connectorType === "html_adapter" ? entry.feedUrl : null,
          catalogStatus: "curated",
          verificationStatus: "verified",
          verificationNote: entry.verificationNote,
          verifiedAt: new Date(),
          active: true,
        },
        create: {
          name: entry.name,
          homepage: entry.homepage,
          normalizedUrl,
          feedUrl: entry.feedUrl || null,
          type,
          connectorType: entry.connectorType,
          provider: entry.provider,
          language: entry.language,
          country: entry.country,
          contentType: entry.contentType as never,
          accessType: entry.accessType as never,
          adapter: entry.connectorType === "html_adapter" ? entry.provider : null,
          pageUrl: entry.connectorType === "html_adapter" ? entry.feedUrl : null,
          catalogStatus: "curated",
          verificationStatus: "verified",
          verificationNote: entry.verificationNote,
          verifiedAt: new Date(),
          createdByUserId: null,
        },
      });

      await prisma.professionSource.upsert({
        where: { sourceId_professionKey: { sourceId: source.id, professionKey: data.profession } },
        update: {},
        create: { sourceId: source.id, professionKey: data.profession },
      });

      console.log(`Seeded curated source [${data.profession}]: ${entry.name}`);
    }
  }
}

async function main() {
  await seedLegacySourcesJson();
  await seedCatalog();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
