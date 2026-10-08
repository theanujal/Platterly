import { CONTACT } from "@/content/site";

export type EnquiryKind = "talk" | "contact";

export interface EnquiryValues {
  name: string;
  email: string;
  phone: string;
  businessType: string;
  subject: string;
  message: string;
}

export const EMPTY_ENQUIRY: EnquiryValues = { name: "", email: "", phone: "", businessType: "", subject: "", message: "" };
export type EnquiryErrors = Partial<Record<keyof EnquiryValues, string>>;

export const BUSINESS_TYPES = ["Wedding caterer", "Corporate caterer", "Party and event caterer", "Outdoor caterer", "Other food business"] as const;
export const SUBJECTS = ["I have a question about Catering by Platterly", "Help with my account", "Billing or an invoice", "A feature I would like", "Partnerships", "Something else"] as const;

/** What the forms check before anything is sent: strict enough to catch typos, not to turn people away. */
export function validateEnquiry(kind: EnquiryKind, input: EnquiryValues): EnquiryErrors {
  const errors: EnquiryErrors = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Please enter your name.";
  else if (name.length > 120) errors.name = "That name is too long.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim()) || input.email.length > 200) errors.email = "Please enter a valid email address.";
  const phone = input.phone.trim();
  const digits = phone.replace(/[^\d]/g, "");
  const phoneRequired = kind === "talk";
  if (phone || phoneRequired) {
    if (!/^[\d+\-()\s]+$/.test(phone) || digits.length < 8 || digits.length > 15) errors.phone = "Please enter a valid phone number.";
  }
  if (kind === "talk" && !input.businessType) errors.businessType = "Please choose the kind of business you run.";
  if (kind === "contact") {
    if (!input.subject) errors.subject = "Please choose what this is about.";
    if (input.message.trim().length < 10) errors.message = "Please tell us a little more (at least a sentence).";
  }
  if (input.message.length > 4000) errors.message = "That message is too long.";
  return errors;
}

/** Where an enquiry goes: a form endpoint when one is set at build time (Platterly Ops, later), otherwise a ready-written email to us. */
export const ENQUIRY_ENDPOINT = process.env.NEXT_PUBLIC_ENQUIRY_ENDPOINT ?? "";

export function enquiryMailto(kind: EnquiryKind, input: EnquiryValues): string {
  const subject = kind === "talk" ? "Talk to us: Catering by Platterly" : `Contact: ${input.subject}`;
  const lines = [`Name: ${input.name.trim()}`, `Email: ${input.email.trim()}`];
  if (input.phone.trim()) lines.push(`Phone: ${input.phone.trim()}`);
  if (input.businessType) lines.push(`Business: ${input.businessType}`);
  lines.push("", input.message.trim());
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

/** "sent" when it reached our form endpoint, "email" when it opened the visitor's email app instead. Throws if the endpoint refuses it. */
export async function submitEnquiry(kind: EnquiryKind, input: EnquiryValues): Promise<"sent" | "email"> {
  if (!ENQUIRY_ENDPOINT) {
    window.location.href = enquiryMailto(kind, input);
    return "email";
  }
  const payload = { kind, ...Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.trim()])), page: window.location.pathname, source: "platterly.in" };
  const response = await fetch(ENQUIRY_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Enquiry failed (${response.status})`);
  return "sent";
}
