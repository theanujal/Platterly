/**
 * Chunk 1 Group 1.4 — path segments that a tenant may never claim as a
 * public-storefront slug (Chunk 8), because they're reserved for the app's
 * own fixed routes on the shared app subdomain. Extend this list whenever a
 * new top-level route is added — never let a tenant slug collide with one.
 */
export const RESERVED_PATH_SEGMENTS = [
  "super",
  "kitchenlogin",
  "dashboard",
  "settings",
  "invitations",
  "api",
  "app",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Belt-and-suspenders only — Next.js's own static-route priority over the
  // `[tenantSlug]` catch-all is what actually prevents a collision for all
  // of these; this list exists so slug-creation UI proactively rejects an
  // obviously-bad choice too. Backfilled 2026-09-15 (Chunk 10.1) — several
  // of these had been live routes since Chunks 6/9/10 without ever being
  // added here.
  "menu-catalog",
  "addons",
  "inventory",
  "customers",
  "quotations",
  "quote",
  "orders",
  "events",
] as const;

export function isReservedPathSegment(segment: string): boolean {
  return RESERVED_PATH_SEGMENTS.includes(
    segment.toLowerCase() as (typeof RESERVED_PATH_SEGMENTS)[number],
  );
}
