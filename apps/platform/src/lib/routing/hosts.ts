/**
 * Host-based routing for the one Platform app (docs/platform-foundation-plan.md, decision D8). Three surfaces, one app:
 *   auth.<root>     sign-in and the identity provider
 *   account.<root>  the Account (profile, businesses, billing)
 *   store.<root>    the Store (products and plans)
 * `<root>` is `localhost:3300` in dev (browsers resolve `*.localhost` to the loopback address) and `platterly.in` in
 * production. Session cookies are host-only, deliberately: nothing here ever sets a cookie `Domain`, so a session on one
 * host is never sent to a sibling. Pure functions, no Node-only imports, so the proxy and the tests can share them.
 */
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "localhost:3300";

export const HOST_KINDS = ["auth", "account", "store"] as const;
export type KnownHostKind = (typeof HOST_KINDS)[number];
export type HostKind = KnownHostKind | "other";

/** `ROOT_DOMAIN` without its port: `localhost` in dev, `platterly.in` in production. */
const ROOT_HOSTNAME = ROOT_DOMAIN.split(":")[0].toLowerCase();

/**
 * Which surface a host belongs to. The match is exact (`auth.<root>`), so a look-alike such as `auth.localhost.evil.test`
 * or `xauth.localhost` is "other" and serves nothing.
 */
export function hostKind(host: string | null | undefined, rootHostname: string = ROOT_HOSTNAME): HostKind {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  return HOST_KINDS.find((kind) => hostname === `${kind}.${rootHostname}`) ?? "other";
}

/** The host the visitor typed. Behind Nginx/Cloudflare `X-Forwarded-Host` wins when the proxy sets it. */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

/** `http` for a localhost root domain, `https` for a real one. */
export function originFor(kind: KnownHostKind, root: string = ROOT_DOMAIN): string {
  return `${root.startsWith("localhost") ? "http" : "https"}://${kind}.${root}`;
}

/** Every origin the app is served from, for the sign-in library's trusted origins. */
export function trustedOrigins(root: string = ROOT_DOMAIN): string[] {
  return HOST_KINDS.map((kind) => originFor(kind, root));
}
