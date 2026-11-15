import type { ReactNode } from "react";
import { identityPool } from "@/modules/auth/identity-db";
import { productBrand } from "@/modules/auth/branding";
import { loadProductLogoExists } from "@/modules/account/product-cards";
import { ProductBrandProvider } from "./brand";

/** Wraps an auth page: reads `client_id` from the provider's sign-in query and brands the page for that product (or leaves it plain). */
export async function Branded({ searchParams, children }: { searchParams: Promise<Record<string, string | string[] | undefined>>; children: ReactNode }) {
  const raw = (await searchParams).client_id;
  const clientId = Array.isArray(raw) ? raw[0] : raw;
  const found = await productBrand(identityPool(), clientId).catch(() => null);
  // The logo is Ops's: when Ops has one for this product the page shows it (from this app's own route); otherwise the product's registered icon.
  const brand = found && clientId && (await loadProductLogoExists(clientId).catch(() => false)) ? { ...found, icon: `/api/product-logo/${encodeURIComponent(clientId)}` } : found;
  return <ProductBrandProvider brand={brand}>{children}</ProductBrandProvider>;
}
