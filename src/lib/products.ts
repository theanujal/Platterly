import { PRODUCT_SUBDOMAINS } from "@/lib/routing/hosts";

/**
 * Every Platterly product the Super Admin manages (ops host). A new product is one more entry here plus its
 * own pages: the sidebar's product group, the switcher and the Overview's product rows all read this list.
 * Client-safe on purpose (icons are keys, not components), so the sidebar can import it.
 */
export type ProductIcon = "chef";

export interface ProductNavItem {
  label: string;
  href: string;
  icon: "users" | "crown";
}

export interface ProductDef {
  key: (typeof PRODUCT_SUBDOMAINS)[number];
  label: string;
  icon: ProductIcon;
  navItems: ProductNavItem[];
}

export const PRODUCTS: ProductDef[] = [
  {
    key: "catering",
    label: "Catering",
    icon: "chef",
    // Catering's pages keep their original paths. A product added later gets /super/products/<key>/...
    navItems: [
      { label: "Caterers", href: "/super/tenants", icon: "users" },
      { label: "Plans", href: "/super/plans", icon: "crown" },
    ],
  },
];

export function productForPath(pathname: string): ProductDef {
  return PRODUCTS.find((p) => p.navItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) || pathname.startsWith(`/super/products/${p.key}`)) ?? PRODUCTS[0];
}
