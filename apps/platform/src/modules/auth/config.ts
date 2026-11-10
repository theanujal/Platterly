import { originFor } from "@/lib/routing/hosts";

// F4 configuration. D1 (Better Auth) and the D2 policy are approved; the NUMBERS below are technical-design values the plan delegates to F4
// ("account and product session lifetimes, idle and absolute durations, renewal, the fresh-authentication window and token lifetimes ... no
// numeric value other than the confirmed 24 hours is approved"). They are set here, in one place, so AJ can change them; they are not AJ-approved.
const HOUR = 3600;
const DAY = 24 * HOUR;

export const SESSION_POLICY = {
  /** Idle expiry: the identity-provider session lasts this long after its last use (it is renewed at most once per `updateAgeSeconds`). */
  idleSeconds: 7 * DAY,
  updateAgeSeconds: DAY,
  /** Absolute expiry: no session lives longer than this from sign-in, however active (enforced when the Account reads the session). */
  absoluteSeconds: 30 * DAY,
  /** How recently someone must have authenticated for a sensitive action. Approved at 5 minutes. No separate check is needed: change email, password, recovery email, two-step, deletion and export each re-ask the current password. */
  freshAuthSeconds: 5 * 60,
  /** D2 (approved): existing sessions survive an ordinary identity-provider outage for up to 24 hours; no new sign-ins. Used by products (F8), not here. */
  outageExtensionSeconds: 24 * HOUR,
} as const;

/** The email OTP, as in Caterly's auth.ts and the F4.1.1 row: 10 minutes, 5 tries, 55 seconds between sends. */
export const OTP = { length: 6, expiresInSeconds: 600, allowedAttempts: 5, resendSeconds: 55 } as const;

export const PASSWORD = { minLength: 8, maxLength: 128 } as const;

/** The one first-party client (F4.2.1): the Account. Public client, PKCE mandatory, exact redirect URI, first-party so no consent screen. */
import { ACCOUNT_CLIENT_ID as CLIENT_ID, STORE_CLIENT_ID as STORE_ID } from "./identity-migrate.mjs";
export const ACCOUNT_CLIENT_ID: string = CLIENT_ID;
/** The second first-party client: the Store. Same rules as the Account. */
export const STORE_CLIENT_ID: string = STORE_ID;
export const ACCOUNT_SCOPES = ["openid", "email", "profile"] as const;
/** The provider name the Platform `user_identities` table records for this identity provider. */
export const IDP_PROVIDER = "platterly-idp";

export const COOKIES = {
  /** Account-host session (host-only, set by the Account after the code flow). */
  accountSession: "platterly_account_session",
  /** Store-host session (host-only). Same signed pointer to the identity-provider session as the Account's. */
  storeSession: "platterly_store_session",
  /** The in-flight sign-in (state, nonce, PKCE verifier), account host, 10 minutes. */
  oidcTransaction: "platterly_account_oidc",
  /** Identity-provider cookies (auth host) get this prefix. */
  idpPrefix: "platterly-idp",
} as const;

export const authOrigin = () => originFor("auth");
export const accountOrigin = () => originFor("account");
export const storeOrigin = () => originFor("store");
export const ACCOUNT_REDIRECT_PATH = "/auth/callback";
export const accountRedirectUri = () => `${accountOrigin()}${ACCOUNT_REDIRECT_PATH}`;
export const storeRedirectUri = () => `${storeOrigin()}${ACCOUNT_REDIRECT_PATH}`;

/** The two first-party surfaces that sign in through the central page. Each has its own client, host, redirect address and session cookie. */
export type Surface = "account" | "store";
export const SURFACES = {
  account: { clientId: ACCOUNT_CLIENT_ID, origin: accountOrigin, redirectUri: accountRedirectUri, sessionCookie: COOKIES.accountSession },
  store: { clientId: STORE_CLIENT_ID, origin: storeOrigin, redirectUri: storeRedirectUri, sessionCookie: COOKIES.storeSession },
} as const;

/** The Account may send people only to a path on its own host: one slash, no scheme, no second slash, no backslash. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 200) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/";
  return raw;
}
