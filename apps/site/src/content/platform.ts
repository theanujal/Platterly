/** The cards in the home page's platform band: what is live, and what is next in line. */
export interface PlatformCard {
  id: string;
  name: string;
  text: string;
  /** Icon name (see components/icons.tsx), or "star" for the review product. */
  icon: string;
  colourway: "sunrise" | "blossom" | "citrus" | "dusk";
  status: "live" | "soon";
  /** Only a live product links anywhere. */
  href?: string;
}

export const PLATFORM = {
  eyebrow: "The Platterly platform",
  title: "Catering is where we start.",
  accent: "More is on the way.",
  copy: "Platterly is building a growing set of products that help food businesses manage, operate and grow. Catering is the first. Here is what is live, and what is next in line.",
  cards: [
    { id: "catering", name: "Catering by Platterly", text: "Manage customers, events, menus, orders, the kitchen and payments in one place.", icon: "chef", colourway: "sunrise", status: "live", href: "/catering/" },
    { id: "rivo", name: "Rivo", text: "Review management software for food businesses: gather customer reviews and keep your name growing.", icon: "star", colourway: "dusk", status: "soon" },
    { id: "more", name: "More tools for food businesses", text: "New products to help you do more with less effort will appear here.", icon: "layers", colourway: "citrus", status: "soon" },
  ] satisfies PlatformCard[],
} as const;
