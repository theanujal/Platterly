import type { ReactNode } from "react";
import { identityPool } from "@/modules/auth/identity-db";
import { productBrand } from "@/modules/auth/branding";
import { ProductBrandProvider } from "./brand";

/** Wraps an auth page: reads `client_id` from the provider's sign-in query and brands the page for that product (or leaves it plain). */
export async function Branded({ searchParams, children }: { searchParams: Promise<Record<string, string | string[] | undefined>>; children: ReactNode }) {
  const raw = (await searchParams).client_id;
  const brand = await productBrand(identityPool(), Array.isArray(raw) ? raw[0] : raw).catch(() => null);
  return <ProductBrandProvider brand={brand}>{children}</ProductBrandProvider>;
}
