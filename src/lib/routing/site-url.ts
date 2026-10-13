/**
 * Where the marketing site (`apps/site`: the legal pages, pricing, blog) lives, derived from `NEXT_PUBLIC_APP_URL`
 * (`https://catering.platterly.in` in production, `http://catering.localhost:3000` in dev) so it also works in client
 * components. The apex is the app's host without the product subdomain; in dev the site runs on port 3100.
 */
export function marketingSiteUrl(path: string, appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const url = new URL(appUrl ?? "http://catering.localhost:3000");
  const host = url.hostname.replace(/^catering\./, "");
  const origin = host === "localhost" ? "http://localhost:3100" : `${url.protocol}//${host}`;
  return `${origin}${path}`;
}
