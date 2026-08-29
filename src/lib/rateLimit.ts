import type { NextRequest } from "next/server";

// Best-effort, in-memory fixed-window rate limiter. This resets on every cold
// start and isn't shared across serverless instances, so on Vercel it's a soft
// backstop rather than a hard guarantee — a real deployment under sustained abuse
// would want a shared store (e.g. Upstash Redis). It's still real protection for
// the common case (a single instance, or self-hosting) and costs no extra infra.
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count++;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Periodically prevent unbounded growth of the map in a long-running process.
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (now > bucket.resetAt) buckets.delete(key);
      }
    },
    10 * 60 * 1000,
  ).unref?.();
}
