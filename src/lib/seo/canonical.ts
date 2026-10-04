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

/** A link with its `?src=` channel tag, so the kitchen's visitor report can say where the visit came from (Chunk 22). */
export function withSrc(url: string, tag: string): string {
  const tagged = new URL(url);
  tagged.searchParams.set("src", tag);
  return tagged.toString();
}
