import { parsePhoneNumberFromString } from "libphonenumber-js/max";

// Phone numbers are stored as E.164 ("+919876543210"), the same form Caterly uses. Every country is accepted. A number typed without a country code is
// read as Indian, as Caterly does for its older records. Plain functions, safe on the server and in the browser.
export function normalizePhone(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, "IN");
  return parsed?.isValid() ? parsed.number : null;
}
