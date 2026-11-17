import "server-only";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { Pool } from "pg";
import { isRegisteredProduct } from "./branding";

/**
 * The registered product a signed sign-in address was made for, or null. `query` is the page address's query string (`sig`, `exp`, `client_id` ...); `secret` is
 * the identity provider's own secret. Anything not signed by this provider, expired, tampered with, or naming a first-party, disabled or unknown client gives null.
 */
export async function signedProduct(pool: Pool, query: string | null | undefined, secret: string): Promise<string | null> {
  if (!query || query.length > 4000) return null;
  try {
    if (!(await verifyOAuthQueryParams(query, secret))) return null;
    const clientId = new URLSearchParams(query).get("client_id");
    return clientId && (await isRegisteredProduct(pool, clientId)) ? clientId : null;
  } catch {
    return null;
  }
}

/** The query string of a Next.js page's `searchParams`, rebuilt for `signedProduct` (the signature does not depend on the order of the parts). */
export function queryFromSearchParams(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  return params.toString();
}

/** What a paid-plan sign-up link adds to the signed address: a plan code and a billing interval. Only well-formed values count; anything else is a trial sign-up. */
export type SignUpOrigin = { clientId: string; plan: { code: string; interval: "MONTHLY" | "ANNUAL" } | null; invited: boolean };

export function planFromQuery(query: string): SignUpOrigin["plan"] {
  const params = new URLSearchParams(query);
  const code = params.get("plan");
  const interval = params.get("interval");
  return code && /^[a-z0-9_-]{1,60}$/.test(code) && (interval === "MONTHLY" || interval === "ANNUAL") ? { code, interval } : null;
}

/** A team invitation sent the person here (`invite=1`): they only need an account to join the inviter's business, so none is made for them. */
export function invitedFromQuery(query: string): boolean {
  return new URLSearchParams(query).get("invite") === "1";
}

/** `signedProduct` plus the plan the product's link carried. The provider signs every part of the address, so the plan cannot be changed or invented by the person. */
export async function signedSignUpOrigin(pool: Pool, query: string | null | undefined, secret: string): Promise<SignUpOrigin | null> {
  const clientId = await signedProduct(pool, query, secret);
  return clientId && query ? { clientId, plan: planFromQuery(query), invited: invitedFromQuery(query) } : null;
}
