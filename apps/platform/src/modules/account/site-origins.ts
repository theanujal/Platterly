import { ROOT_DOMAIN } from "@/lib/routing/hosts";

/**
 * The marketing site's own addresses, the only pages that may ask the header endpoint who is signed in. `SITE_ORIGINS` (comma separated) wins; otherwise it is
 * the root domain itself (`https://platterly.in` and its `www`) and, for a localhost root, the site's dev server on port 3100.
 */
export function siteOrigins(env: NodeJS.ProcessEnv = process.env, root: string = ROOT_DOMAIN): string[] {
  const named = (env.SITE_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (named.length) return named;
  const hostname = root.split(":")[0].toLowerCase();
  return hostname === "localhost" ? ["http://localhost:3100"] : [`https://${hostname}`, `https://www.${hostname}`];
}

/** The headers that let one of those pages read the answer with the person's cookie, or none at all for any other origin. */
export function corsHeaders(origin: string | null, allowed: string[] = siteOrigins()): Record<string, string> {
  const base = { vary: "Origin", "cache-control": "no-store" };
  if (!origin || !allowed.includes(origin)) return base;
  return { ...base, "access-control-allow-origin": origin, "access-control-allow-credentials": "true" };
}
