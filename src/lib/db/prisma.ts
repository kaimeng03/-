import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and set DATABASE_URL (see README 「資料庫設定」).",
    );
  }
  const adapter = new PrismaPg(
    {
      connectionString,
      // Proactively recycle idle connections well before a proxy/pooler on
      // the other end (e.g. `prisma dev`'s local proxy, or a hosted pooler)
      // silently drops them — a connection the pool hands out after that
      // happened surfaces as "Connection terminated unexpectedly".
      idleTimeoutMillis: 10_000,
    },
    {
      // Without these, a pool/connection 'error' event (exactly what an
      // unexpectedly-dropped idle connection emits) has no listener — and an
      // unhandled 'error' event on a Node EventEmitter crashes the whole
      // process. These keep that from taking the entire dev/prod server down;
      // the pool recovers by opening a fresh connection on the next query.
      onPoolError: (err) => console.warn("Prisma pg pool error (recovered):", err.message),
      onConnectionError: (err) => console.warn("Prisma pg connection error (recovered):", err.message),
    },
  );
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
