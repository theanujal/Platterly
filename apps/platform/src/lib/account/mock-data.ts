/**
 * Static mock data for the Account prototype. Nothing here is real: no user, business or subscription exists behind it.
 * The shapes are kept close to what the plan describes (organisations with a central role, products linked per
 * organisation) so the screens can later read the same fields from the Platform services.
 */
export type BusinessStatus = "active" | "trial" | "setup";
export type CentralRole = "Owner" | "Admin" | "Manager" | "Member";

export type Business = {
  id: string;
  name: string;
  type: string;
  city: string;
  status: BusinessStatus;
  role: CentralRole;
  members: number;
};

export type ProductLinkStatus = "active" | "trial" | "none";
export type ProductLink = { status: ProductLinkStatus; detail: string };

export type Profile = {
  fullName: string;
  email: string;
  phone: string;
  timezone: string;
  language: string;
};

export const MOCK_USER = {
  firstName: "Meera",
  profile: {
    fullName: "Meera Kapoor",
    email: "meera.kapoor@example.com",
    phone: "+91 98200 00000",
    timezone: "Asia/Kolkata (IST, UTC+5:30)",
    language: "English (India)",
  } satisfies Profile,
};

export const BUSINESSES: Business[] = [
  { id: "spice-route", name: "Spice Route Caterers", type: "Wedding and event catering", city: "Mumbai", status: "active", role: "Owner", members: 8 },
  { id: "saffron-co", name: "Saffron & Co. Events", type: "Corporate catering", city: "Pune", status: "trial", role: "Owner", members: 3 },
  { id: "little-basil", name: "Little Basil Cloud Kitchen", type: "Cloud kitchen", city: "Bengaluru", status: "setup", role: "Admin", members: 2 },
];

export const INITIAL_CATERLY: Record<string, ProductLink> = {
  "spice-route": { status: "active", detail: "Caterly Pro, renews 14 Jan 2027" },
  "saffron-co": { status: "trial", detail: "Free trial, 12 days left" },
  "little-basil": { status: "none", detail: "Not set up for this business" },
};

export const TIMEZONES = ["Asia/Kolkata (IST, UTC+5:30)", "Asia/Dubai (GST, UTC+4)", "Asia/Singapore (SGT, UTC+8)", "Europe/London (UTC+0)"];
export const LANGUAGES = ["English (India)", "English (UK)"];

export const STATUS_LABEL: Record<BusinessStatus, string> = { active: "Active", trial: "On trial", setup: "Setup pending" };
export const LINK_LABEL: Record<ProductLinkStatus, string> = { active: "Active", trial: "On trial", none: "Not set up" };

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
