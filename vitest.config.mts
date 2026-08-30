import "dotenv/config";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["node_modules/**", ".next/**"],
    env: {
      // Explicitly forwarded (not just inherited) so DB-integration tests can
      // reach the local dev database regardless of Vitest's worker pool.
      DATABASE_URL: process.env.DATABASE_URL,
    },
    // The DB-integration test files each open their own PrismaClient/pg.Pool.
    // Running multiple of those concurrently against `prisma dev`'s local
    // proxy triggers a prepared-statement protocol error (08P01) that doesn't
    // reflect an application bug — each file passes cleanly on its own. Serial
    // file execution avoids the concurrency entirely; the suite is small
    // enough that this costs little.
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: "@/auth", replacement: path.resolve(import.meta.dirname, "./auth.ts") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
});
