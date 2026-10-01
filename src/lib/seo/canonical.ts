/**
 * Shared canonical-URL helper (Chunk 1 Group 1.4). `APP_URL` is the caterer
 * product's own host (`https://catering.platterly.in` in production; marketing
 * stays on the `platterly.in` apex, outside this app) — defaults to its
 * `*.localhost` dev host. Every customer-facing link is built here.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://catering.localhost:3000";

export function canonicalUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(path, APP_URL).toString();
}
