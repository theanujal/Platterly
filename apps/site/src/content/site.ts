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
  description: "Platterly builds focused software for food businesses, starting with Catering by Platterly: customers, events, menus, orders, kitchen and payments in one place.",
} as const;

/** The company behind Platterly, as named in the policies. */
export const COMPANY = {
  legalName: "Fragen Network Private Limited",
  address: "Bangalore, India",
  grievanceEmail: "hello@platterly.in",
  jurisdiction: "Bangalore, India",
  lastUpdated: "5 October 2026",
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
  hours: [],
  addressLines: ["Fragen Network Private Limited", "Bangalore, India"],
  /** Typical reply time, shown on the forms. */
  reply: "We usually reply within one working day.",
};
