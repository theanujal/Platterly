/**
 * "+91 98765 43210" everywhere a phone number is displayed (AJ, 2026-09-19).
 * Platterly is India-only for now (every `PhoneInput` defaults to `IN`), so
 * this is a plain regex formatter rather than importing
 * `react-phone-number-input`'s main export into Server Components — that
 * export bundles its React component tree and broke the production build
 * when evaluated outside the browser (`/[tenantSlug]`'s page-data
 * collection). Older rows saved before `PhoneInput` was used everywhere may
 * be a bare 10-digit number with no country code — the last 10 digits are
 * taken either way, same assumption `PhoneInput` already makes at entry time.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  const last10 = phone.replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return phone;
  return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
}
