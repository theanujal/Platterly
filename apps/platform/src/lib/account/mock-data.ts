/**
 * Static mock data for the Account prototype. Nothing here is real: no user, business or subscription exists behind it.
 * The shapes are kept close to what the plan describes (organisations with a central role, products linked per
 * organisation) so the screens can later read the same fields from the Platform services.
 */
export type BusinessStatus = "active" | "trial" | "setup";
/** One central role exists: the Business Admin (decision C5). Employees and their roles live inside each product. */
export type CentralRole = "Admin";

/** An account holds exactly one business (decision D15: one business per user per product, no list, no switcher). */
export type Business = {
  id: string;
  name: string;
  type: string;
  city: string;
  status: BusinessStatus;
  role: CentralRole;
};

export type ProductId = "caterly" | "rivo";
export const PRODUCTS: { id: ProductId; name: string; initial: string }[] = [
  { id: "caterly", name: "Caterly", initial: "C" },
  { id: "rivo", name: "Rivo", initial: "R" },
];

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

export const BUSINESS: Business = { id: "spice-route", name: "Spice Route Caterers", type: "Wedding and event catering", city: "Mumbai", status: "setup", role: "Admin" };

/** Caterly starts as not set up, so the whole activation path (set up, then open) can be shown. */
export const INITIAL_CATERLY: ProductLink = { status: "none", detail: "Not set up for this business" };

/** Sample "signed-in devices" for the Security page layout. Nothing here is a real session. */
export type SampleDevice = { id: string; label: string; detail: string; current: boolean };
export const SAMPLE_DEVICES: SampleDevice[] = [
  { id: "d1", label: "Chrome on a laptop", detail: "Mumbai · active now", current: true },
  { id: "d2", label: "Safari on a phone", detail: "Mumbai · last active 2 days ago", current: false },
  { id: "d3", label: "Chrome on a tablet", detail: "Pune · last active 3 weeks ago", current: false },
];

export const TIMEZONES = ["Asia/Kolkata (IST, UTC+5:30)", "Asia/Dubai (GST, UTC+4)", "Asia/Singapore (SGT, UTC+8)", "Europe/London (UTC+0)"];
export const LANGUAGES = ["English (India)", "English (UK)"];

export const STATUS_LABEL: Record<BusinessStatus, string> = { active: "Active", trial: "On trial", setup: "Setup pending" };
export const LINK_LABEL: Record<ProductLinkStatus, string> = { active: "Active", trial: "On trial", none: "Not set up" };

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
