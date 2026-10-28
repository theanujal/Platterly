/**
 * Facts every page shares. Change them here.
 * TODO(AJ): hello@platterly.in is the working contact address; change it here if the real one differs.
 */
export const SITE = {
  name: "Platterly",
  url: "https://platterly.in",
  /** The kitchen sign-in and sign-up screen lives at the root of the catering host. */
  appUrl: "https://catering.platterly.in/",
  contactEmail: "hello@platterly.in",
  tagline: "Software built for the food business.",
  description: "Platterly builds focused software for food businesses, starting with Caterly by Platterly: customers, events, menus, orders, kitchen and payments in one place.",
  /** Real social profiles only; they become the Organization's `sameAs`. TODO: add Instagram. */
  social: ["https://www.facebook.com/platterlyindia", "https://www.linkedin.com/company/platterlyindia"],
} as const;

/** Sharing defaults. A page's own `openGraph` replaces the layout's whole object (Next merges metadata shallowly), so pages spread this. */
export const OPEN_GRAPH = { siteName: "Platterly", type: "website" as const, locale: "en_IN", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Platterly" }] };

/** A page's canonical address and og:url, which must agree. `path` is like "/about/". */
export const pageLinks = (path: string) => ({ alternates: { canonical: path }, openGraph: { ...OPEN_GRAPH, url: path } });

/** The company behind Platterly, as named in the policies. */
export const COMPANY = {
  legalName: "Fragen Network Private Limited",
  address: "Rani Nivas, 138, 4th Cross Main, Gaurav Nagar, Kothanoor Village, JP Nagar 7th Phase, Bengaluru, Karnataka 560078",
  grievanceEmail: "hello@platterly.in",
  jurisdiction: "Bangalore, India",
  lastUpdated: "27 October 2026",
} as const;

/**
 * Customer words for the home and Catering pages. Leave empty until a customer has agreed to be quoted: an empty list
 * shows nothing. Shape: { quote, name, role, business }.
 */
import type { Testimonial } from "@/components/proof";
export const TESTIMONIALS: Testimonial[] = [];

/**
 * How people can reach us. Anything left empty is simply not shown on the Contact page: nothing here is invented.
 * TODO(AJ): add the phone, WhatsApp number and opening hours when you have them.
 */
export const CONTACT: { email: string; phone: string; whatsapp: string; hours: string[]; addressLines: string[]; reply: string } = {
  email: "hello@platterly.in",
  phone: "",
  whatsapp: "",
  hours: ["Monday to Saturday, 10 am to 6 pm IST"],
  addressLines: ["Fragen Network Private Limited", "Rani Nivas, 138, 4th Cross Main, Gaurav Nagar", "Kothanoor Village, JP Nagar 7th Phase", "Bengaluru, Karnataka 560078"],
  /** Typical reply time, shown on the forms. */
  reply: "We usually reply within one working day.",
};
