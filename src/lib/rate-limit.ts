import "server-only";

// Best-effort, in-memory sliding window — enough to blunt a script hammering
// the anonymous storefront endpoints from one IP on a single server process.
// It does not coordinate across instances; swap for Redis (already in the
// PRD's stack) when the app runs more than one.
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/**
 * Same window as `isRateLimited`, but says how much is left and when the window frees up, for the `X-RateLimit-*`
 * headers of the public API (Chunk 25). `resetMs` is how long until the oldest counted request ages out.
 */
export function rateLimitState(key: string, limit: number, windowMs: number): { limited: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const limited = recent.length >= limit;
  if (!limited) recent.push(now);
  hits.set(key, recent);
  return { limited, remaining: Math.max(0, limit - recent.length), resetMs: recent.length > 0 ? Math.max(0, windowMs - (now - recent[0])) : windowMs };
}
