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
