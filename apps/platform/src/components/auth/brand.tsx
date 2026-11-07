"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProductBrand } from "@/modules/auth/branding";

const BrandContext = createContext<ProductBrand | null>(null);

/** Hands the product being signed in to (looked up on the server) to every auth card below it. */
export function ProductBrandProvider({ brand, children }: { brand: ProductBrand | null; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
export const useProductBrand = () => useContext(BrandContext);
