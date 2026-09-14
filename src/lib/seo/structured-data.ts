/**
 * Chunk 8 Group 8.3 — schema.org JSON-LD for the public storefront (PRD
 * §26/Updated doc §14's SEO instruction: Restaurant/Menu structured data).
 * Pure data shaping, no DB access, so it's unit-testable without a real
 * Organization/Menu row.
 */
export interface RestaurantJsonLdInput {
  name: string;
  description?: string | null;
  url: string;
  image?: string | null;
  telephone?: string | null;
  address?: {
    streetAddress?: string | null;
    addressLocality?: string | null;
    addressRegion?: string | null;
    postalCode?: string | null;
    addressCountry?: string | null;
  };
  menuItems?: { name: string; description?: string | null; price?: number }[];
}

export function buildRestaurantJsonLd(input: RestaurantJsonLdInput): Record<string, unknown> {
  const addressEntries = input.address
    ? Object.fromEntries(Object.entries(input.address).filter(([, v]) => v))
    : {};
  const hasAddress = Object.keys(addressEntries).length > 0;

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(hasAddress ? { address: { "@type": "PostalAddress", ...addressEntries } } : {}),
    ...(input.menuItems && input.menuItems.length > 0
      ? {
          hasMenu: {
            "@type": "Menu",
            hasMenuItem: input.menuItems.map((item) => ({
              "@type": "MenuItem",
              name: item.name,
              ...(item.description ? { description: item.description } : {}),
              ...(item.price !== undefined
                ? { offers: { "@type": "Offer", price: item.price, priceCurrency: "INR" } }
                : {}),
            })),
          },
        }
      : {}),
  };
}
