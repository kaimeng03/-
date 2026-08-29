import type { NextRequest } from "next/server";

// Origin-based CSRF defense for mutation routes. This deliberately does NOT trust
// the request's own Host or X-Forwarded-Host headers as the "expected" value —
// those can be set by the client (or by an untrusted intermediary) depending on
// deployment topology, so comparing Origin against Host is comparing one
// attacker-influenced value against another. Instead this compares Origin against
// an explicit allowlist built from server-controlled configuration.

function getTrustedOrigins(): string[] {
  const origins = new Set<string>();

  // Vercel sets these automatically at build/runtime — no manual config needed
  // for the common case of a single Vercel deployment.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  // Escape hatch for a custom domain, or any other host, self-hosted deployment.
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      origins.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    } catch {
      // ignore a malformed value rather than let it silently disable the check
    }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
  }

  return Array.from(origins);
}

export interface OriginCheckResult {
  ok: boolean;
  reason?: "missing-origin" | "untrusted-origin";
}

/**
 * Browsers attach an Origin header to POST/PUT/DELETE/PATCH requests — including
 * same-origin ones — so a legitimate same-site fetch() from our own frontend
 * always has one. A request with no Origin, or one that doesn't match our known
 * origins, is refused rather than guessed at.
 */
export function checkTrustedOrigin(req: NextRequest): OriginCheckResult {
  const origin = req.headers.get("origin");
  if (!origin) return { ok: false, reason: "missing-origin" };

  const trusted = getTrustedOrigins();
  if (trusted.length === 0) {
    // Nothing configured to compare against (e.g. neither Vercel env vars nor
    // NEXT_PUBLIC_SITE_URL are set, in a non-dev environment). Fail closed.
    return { ok: false, reason: "untrusted-origin" };
  }

  return trusted.includes(origin) ? { ok: true } : { ok: false, reason: "untrusted-origin" };
}
