// Caterly as a sign-in client of Platterly's central identity provider (plan F8.1.1 / F8.1.3). Everything here is inert unless PLATFORM_SSO=1, so with the
// switch off Caterly signs people in exactly as it always has.
export const PLATFORM_PROVIDER_ID = "platterly";
export const PLATFORM_CLIENT_ID = "caterly";

export const platformSsoEnabled = () => process.env.PLATFORM_SSO === "1";
export const platformAuthOrigin = () => process.env.PLATFORM_AUTH_ORIGIN ?? "http://auth.localhost:3300";
/** The provider's issuer address: what ID tokens and logout tokens must name. */
export const platformIssuer = () => `${platformAuthOrigin()}/api/auth`;

/** Only a path on Caterly itself: never an absolute or protocol-relative address (no open redirect through `?next=`). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : fallback;
}
