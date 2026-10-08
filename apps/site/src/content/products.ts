/**
 * The products. Each has its own colour, which appears only on its icon tile, its label, the tint behind its pictures
 * and the line under its active feature (the pages themselves keep Platterly's palette). Add a product here and it
 * shows up in the menu, the home scene and the platform list.
 */
export interface Product {
  id: string;
  name: string;
  short: string;
  tagline: string;
  href: string;
  icon: string;
  /** The product's own colour. Catering uses the catering app's orange. */
  color: string;
  tint: string;
}

export const PRODUCTS: Product[] = [
  { id: "catering", name: "Catering by Platterly", short: "Catering", tagline: "Run a catering business from enquiry to event.", href: "/catering/", icon: "chef", color: "#ff6900", tint: "#fff3e6" },
];

export const CATERING_PRODUCT = PRODUCTS[0];

/** Inline style that gives an element a product's colours. */
export function productVars(product: Product): React.CSSProperties {
  return { "--product": product.color, "--product-tint": product.tint } as React.CSSProperties;
}
