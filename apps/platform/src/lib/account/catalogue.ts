import type { LinkState, ProductKey } from "@/modules/account/types";

// Display copy for the Account screens. This is the product list the prototype shows, not user or business data: the authoritative product
// registry is Ops, and Platform Core's refresher for it (F6.1.3) is not built, so the two known products are listed here until it is.
export const PRODUCTS: { id: ProductKey; name: string; initial: string }[] = [
  { id: "caterly", name: "Caterly", initial: "C" },
  { id: "rivo", name: "Rivo", initial: "R" },
];

export const STATUS_LABEL = { active: "Active", suspended: "Suspended" } as const;
export const LINK_LABEL: Record<LinkState, string> = { linked: "Linked", suspended: "Suspended", none: "Not set up" };

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
