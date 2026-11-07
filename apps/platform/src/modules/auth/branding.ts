import type { Pool } from "pg";
import { ACCOUNT_CLIENT_ID, STORE_CLIENT_ID } from "./config";

/** How a product shows up on the central sign-in pages (option B: one Platterly page, branded per product). */
export type ProductBrand = { name: string; icon: string | null; /** A look the central pages can wear for this product (`caterly`: Caterly's split-screen sign-in), or null for the plain branded card. */ theme: ProductTheme | null };
export const PRODUCT_THEMES = ["caterly"] as const;
export type ProductTheme = (typeof PRODUCT_THEMES)[number];

const CLIENT_ID = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * The name and logo of the product the person is signing in to, from its registered client. This is cosmetic: it decides what the page SAYS, never where
 * the person is sent (that is the provider's own signed query and exact redirect addresses). So an unknown, disabled or first-party client simply gets the
 * plain Platterly page, a logo is only used when it is hosted on one of the product's own registered addresses (no third-party image, no tracking pixel),
 * and the name is plain text.
 */
export async function productBrand(pool: Pool, clientId: string | null | undefined): Promise<ProductBrand | null> {
  if (!clientId || clientId === ACCOUNT_CLIENT_ID || clientId === STORE_CLIENT_ID || !CLIENT_ID.test(clientId)) return null;
  const { rows } = await pool.query('select "name", "icon", "disabled", "redirectUris", "metadata" from "oauthClient" where "clientId" = $1', [clientId]);
  const row = rows[0] as { name: string | null; icon: string | null; disabled: boolean | null; redirectUris: unknown; metadata: unknown } | undefined;
  const name = row?.name?.trim();
  if (!row || row.disabled || !name || name.length > 60) return null;
  const origins = new Set<string>();
  for (const uri of Array.isArray(row.redirectUris) ? row.redirectUris : []) {
    try {
      origins.add(new URL(String(uri)).origin);
    } catch {
      /* ignore a malformed registered address */
    }
  }
  let icon: string | null = null;
  try {
    const url = row.icon ? new URL(row.icon) : null;
    if (url && /^https?:$/.test(url.protocol) && origins.has(url.origin)) icon = url.toString();
  } catch {
    icon = null;
  }
  // The look is chosen only from this fixed list, so a client record can never make the page render anything it does not already contain.
  const wanted = row.metadata && typeof row.metadata === "object" ? (row.metadata as { theme?: unknown }).theme : undefined;
  const theme = (PRODUCT_THEMES as readonly unknown[]).includes(wanted) ? (wanted as ProductTheme) : null;
  return { name, icon, theme };
}
