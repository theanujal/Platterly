import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const PRODUCT_COOKIE = "ops_product";

export interface SwitcherProduct {
  key: string;
  name: string;
}

/** Products the switcher offers: the registered ones that are active. A new product appears here as soon as it is registered. */
export async function listSwitcherProducts(): Promise<SwitcherProduct[]> {
  return prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { key: true, name: true } });
}

/**
 * The product the staff member picked in the sidebar, or null for "All products". Kept in a cookie (a preference, not data), and
 * checked against the registry so a retired or unknown key falls back to All products.
 */
export async function getSelectedProduct(): Promise<SwitcherProduct | null> {
  const key = (await cookies()).get(PRODUCT_COOKIE)?.value;
  if (!key) return null;
  return (await listSwitcherProducts()).find((p) => p.key === key) ?? null;
}
