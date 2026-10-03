/**
 * Host-based product routing. Every Platterly product lives on its own
 * subdomain of `ROOT_DOMAIN` (`platterly.in` in production, `localhost:3000`
 * in dev, where browsers resolve `*.localhost` to the loopback address):
 *   catering.<root>  the caterer product, its public storefront and customer links
 *   ops.<root>       the platform Super Admin, for every product
 * A new product is one more entry in `PRODUCT_SUBDOMAINS`. Pure functions, no
 * Node-only imports, so the proxy, Better Auth and the e2e config can all use them.
 */
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "localhost:3000";

export const PRODUCT_SUBDOMAINS = ["catering"] as const;
export const OPS_SUBDOMAIN = "ops";

export type HostKind = "ops" | "catering" | "other";

/** `ROOT_DOMAIN` without its port: `localhost` in dev, `platterly.in` in production. */
const ROOT_HOSTNAME = ROOT_DOMAIN.split(":")[0].toLowerCase();

/**
 * Which surface a host belongs to. The match is exact (`catering.<root>`, `ops.<root>`), so a look-alike such as
 * `catering.example.com` or `ops.localhost.evil.test` is "other" and serves nothing.
 */
export function hostKind(host: string | null | undefined, rootHostname: string = ROOT_HOSTNAME): HostKind {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  if (hostname === `${OPS_SUBDOMAIN}.${rootHostname}`) return "ops";
  if (PRODUCT_SUBDOMAINS.some((sub) => hostname === `${sub}.${rootHostname}`)) return "catering";
  return "other";
}

/**
 * The host the visitor actually typed. Behind Nginx/Cloudflare the app can see an internal
 * `Host` (e.g. 127.0.0.1), so `X-Forwarded-Host` wins when the proxy sets it.
 */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

/** `http` for a localhost root domain, `https` for a real one. */
export function originFor(subdomain: string): string {
  const scheme = ROOT_DOMAIN.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${subdomain}.${ROOT_DOMAIN}`;
}

/** Every origin the app is served from, for Better Auth's `trustedOrigins`. */
export function trustedOrigins(): string[] {
  return [OPS_SUBDOMAIN, ...PRODUCT_SUBDOMAINS].map(originFor);
}
