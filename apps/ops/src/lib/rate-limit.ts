import "server-only";

// Best-effort, in-memory sliding window for the public form endpoint: enough to blunt a script from one address on one
// server process. It does not coordinate across instances (blue and green each count their own).
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}
