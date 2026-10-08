import { CATERING_PRODUCT } from "@/content/products";
import { SITE } from "@/content/site";

/** The menus in the header, the mobile panel and the footer: every link goes to a real page or a real address. */
export interface NavLink {
  label: string;
  href: string;
  text?: string;
  /** Marks the Catering entry so the menu can draw its coloured tile. */
  product?: boolean;
}
export interface NavGroup {
  label: string;
  links: NavLink[];
}

export const MENUS: { label: string; groups: NavGroup[] }[] = [
  {
    label: "Product",
    groups: [{ label: "Products", links: [{ label: CATERING_PRODUCT.name, href: CATERING_PRODUCT.href, text: "Simplified catering management", product: true }] }],
  },
  {
    label: "Resources",
    groups: [
      {
        label: "Discover",
        links: [
          { label: "About Platterly", href: "/about/" },
          { label: "Blog", href: "/blog/" },
          { label: "What's new", href: "/whats-new/" },
          { label: "Upcoming features", href: "/upcoming/" },
        ],
      },
      { label: "Support", links: [{ label: "Contact us", href: "/contact/" }, { label: "Talk to us", href: "/talk-to-us/" }, { label: "Log in", href: SITE.appUrl }] },
    ],
  },
];
