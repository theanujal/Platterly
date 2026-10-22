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
