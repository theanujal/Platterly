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
] as const;

export function isReservedPathSegment(segment: string): boolean {
  return RESERVED_PATH_SEGMENTS.includes(
    segment.toLowerCase() as (typeof RESERVED_PATH_SEGMENTS)[number],
  );
}
