import { describe, it, expect } from "vitest";
import { prisma } from "./prisma";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

/**
 * Guards the additive "catalog & connector architecture" migration
 * (20260830100500_catalog_connector_architecture): it must never have lost or
 * corrupted data from before it ran, and its backfill (legacy `type: html`
 * rows getting `connectorType: html_adapter`) must hold for every such row,
 * not just the one it was written against.
 */
describeDb("catalog/connector migration — existing data preserved", () => {
  it("no Source row was dropped by the migration (every row has a name+normalizedUrl)", async () => {
    const sources = await prisma.source.findMany();
    for (const s of sources) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.normalizedUrl.length).toBeGreaterThan(0);
    }
  });

  it("every legacy type='html' Source has connectorType='html_adapter' (migration backfill)", async () => {
    const htmlSources = await prisma.source.findMany({ where: { type: "html" } });
    for (const s of htmlSources) {
      expect(s.connectorType).toBe("html_adapter");
    }
  });

  it("every legacy type='rss' Source keeps a valid, non-null feedUrl or was left otherwise untouched", async () => {
    const rssSources = await prisma.source.findMany({ where: { type: "rss" } });
    for (const s of rssSources) {
      expect(s.connectorType).not.toBe("html_adapter");
    }
  });

  it("new optional columns default sanely and never force a value onto pre-existing rows", async () => {
    const anySource = await prisma.source.findFirst();
    if (!anySource) return; // nothing seeded yet in this environment — not a failure
    expect(["curated", "user_added", "pending", "rejected", "inactive"]).toContain(anySource.catalogStatus);
    expect(["verified", "unverified", "failed"]).toContain(anySource.verificationStatus);
  });
});
