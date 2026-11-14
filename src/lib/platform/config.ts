// Caterly as a sign-in client of Platterly's central identity provider (plan F8.1.1 / F8.1.3). Single sign-in IS Caterly's login: there is no switch. The
// only setting is where Platterly's sign-in lives (PLATFORM_AUTH_ORIGIN).
export const PLATFORM_PROVIDER_ID = "platterly";
export const PLATFORM_CLIENT_ID = "caterly";

export const platformAuthOrigin = () => process.env.PLATFORM_AUTH_ORIGIN ?? "http://auth.localhost:3300";
/** The provider's issuer address: what ID tokens and logout tokens must name. */
export const platformIssuer = () => `${platformAuthOrigin()}/api/auth`;

/** Only a path on Caterly itself: never an absolute or protocol-relative address (no open redirect through `?next=`). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : fallback;
}

/** Where the person manages their own details (name, phone, email). Products only show them; the Account is the one place they change. */
export const platformAccountOrigin = () => process.env.PLATFORM_ACCOUNT_ORIGIN ?? "http://account.localhost:3300";

/** Where the Business Admin pays and manages the plan (the Platterly Store). Caterly has no billing pages of its own (AJ, 2026-11-14). */
export const platformStoreOrigin = () => process.env.PLATFORM_STORE_ORIGIN ?? "http://store.localhost:3300";
export const storeManageUrl = () => `${platformStoreOrigin()}/manage/caterly`;
