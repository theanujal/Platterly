import { parsePhoneNumberFromString, isValidPhoneNumber } from "libphonenumber-js/max";

/**
 * Every country is accepted now (AJ, 2026-09-25) — the PhoneInput lets the
 * visitor pick any country and freezes only the calling code. Numbers are
 * stored as E.164 ("+919876543210", "+8613812345678"). Bare/legacy 10-digit
 * numbers with no country code (rows saved before PhoneInput was used
 * everywhere) are still read as Indian, as before.
 *
 * This is plain `libphonenumber-js` (pure functions, safe in Server
 * Components) rather than `react-phone-number-input`'s main export, which
 * bundles its React component tree and broke the production build when
 * evaluated outside the browser (`/[tenantSlug]`'s page-data collection).
 */

/** "+91 98765 43210" for India (unchanged), "+86 138 1234 5678" for any other country — used everywhere a phone is displayed. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(phone);
    if (parsed && parsed.countryCallingCode !== "91") return parsed.formatInternational();
  }
  const last10 = phone.replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return phone;
  return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
}

/**
 * Canonical storage form for any phone string before it's written to the DB
 * or used as a lookup key (AJ, 2026-09-19) — added after two Customer rows
 * for the same real number ("08860756024" from the old plain-text field vs.
 * "+918860756024" from PhoneInput) silently coexisted past
 * `@@unique([organizationId, phone])`, since the constraint compares raw
 * strings, not phone-equivalence. Every write/lookup site must run the value
 * through this first. A "+"-prefixed number keeps its own country code
 * (E.164, spaces stripped); anything without one is read as an Indian
 * 10-digit number; anything else is returned unchanged so a malformed value
 * fails validation elsewhere rather than being silently coerced.
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    return parsed ? parsed.number : `+${trimmed.replace(/\D/g, "")}`;
  }
  const last10 = phone.replace(/\D/g, "").slice(-10);
  return last10.length === 10 ? `+91${last10}` : phone;
}

/** A complete, valid number for its own country (10 digits for India, 11 for China, …). Expects a normalized value. */
export function isValidPhone(phone: string): boolean {
  return isValidPhoneNumber(phone);
}

/** Digits-only international form ("919876543210") for wa.me links; falls back to India for a bare 10-digit legacy number. */
export function whatsappDigits(phone: string): string {
  const normalized = normalizePhone(phone);
  return normalized.replace(/\D/g, "");
}
