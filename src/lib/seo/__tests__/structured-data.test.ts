import { describe, it, expect } from "vitest";
import { buildRestaurantJsonLd } from "@/lib/seo/structured-data";

describe("buildRestaurantJsonLd (Chunk 8 Group 8.3)", () => {
  it("builds the minimal Restaurant shape with only name/url", () => {
    const jsonLd = buildRestaurantJsonLd({ name: "Wedding Bells Catering", url: "https://platterly.in/weddingbells" });
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "Wedding Bells Catering",
      url: "https://platterly.in/weddingbells",
    });
  });

  it("includes optional fields only when present", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Spice Route",
      url: "https://platterly.in/spiceroute",
      description: "Authentic Indian catering.",
      image: "https://platterly.in/uploads/logo.png",
      telephone: "+911234567890",
    });
    expect(jsonLd.description).toBe("Authentic Indian catering.");
    expect(jsonLd.image).toBe("https://platterly.in/uploads/logo.png");
    expect(jsonLd.telephone).toBe("+911234567890");
  });

  it("omits address entirely when no address field is provided", () => {
    const jsonLd = buildRestaurantJsonLd({ name: "No Address Co", url: "https://platterly.in/noaddress" });
    expect(jsonLd.address).toBeUndefined();
  });

  it("builds a PostalAddress from only the address fields that are actually set", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Partial Address Co",
      url: "https://platterly.in/partial",
      address: { addressLocality: "Bengaluru", addressRegion: "Karnataka", streetAddress: null, postalCode: undefined, addressCountry: null },
    });
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Bengaluru",
      addressRegion: "Karnataka",
    });
  });

  it("omits hasMenu when there are no menu items", () => {
    const jsonLd = buildRestaurantJsonLd({ name: "Empty Menu Co", url: "https://platterly.in/empty", menuItems: [] });
    expect(jsonLd.hasMenu).toBeUndefined();
  });

  it("builds hasMenu.hasMenuItem with an Offer per item that has a price", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Full Menu Co",
      url: "https://platterly.in/full",
      menuItems: [
        { name: "Paneer Tikka", description: "Grilled cottage cheese", price: 150 },
        { name: "Mystery Dish" },
      ],
    });
    expect(jsonLd.hasMenu).toEqual({
      "@type": "Menu",
      hasMenuItem: [
        {
          "@type": "MenuItem",
          name: "Paneer Tikka",
          description: "Grilled cottage cheese",
          offers: { "@type": "Offer", price: 150, priceCurrency: "INR" },
        },
        { "@type": "MenuItem", name: "Mystery Dish" },
      ],
    });
  });
});
