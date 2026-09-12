/**
 * Shared canonical-URL helper (Chunk 1 Group 1.4). `APP_URL` should be set to
 * the app's real subdomain in every deployed environment (marketing stays on
 * the `platterly.in` apex domain, outside this app) — defaults to localhost
 * for dev.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function canonicalUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(path, APP_URL).toString();
}
