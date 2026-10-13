import "server-only";

// Fixed-window in-memory limiter. Adequate for a single-instance deployment; swap for a shared
// store (e.g. the database or Redis) if SIMS is ever run on multiple instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterMs: 0 };
  }
  b.count += 1;
  return b.count <= limit ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: b.resetAt - now };
}
