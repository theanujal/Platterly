import "server-only";

// Best-effort, in-memory sliding window for the public form endpoint: enough to blunt a script from one address on one
// server process. It does not coordinate across instances (blue and green each count their own).
const hits = new Map<string, number[]>();
let longestWindowMs = 0;
let lastSweep = 0;

export function isRateLimited(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  // Every new address leaves a key behind, so at most once a minute drop the keys with no hit inside the longest window
  // in use (issue 84).
  longestWindowMs = Math.max(longestWindowMs, windowMs);
  if (now - lastSweep >= 60_000) {
    for (const [k, times] of hits) if (now - times[times.length - 1] >= longestWindowMs) hits.delete(k);
    lastSweep = now;
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/** How many keys are held in memory (for tests). */
export function trackedKeys(): number {
  return hits.size;
}
