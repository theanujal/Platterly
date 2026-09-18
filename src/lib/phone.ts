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

/**
 * Canonical storage form ("+91XXXXXXXXXX") for any phone string before it's
 * written to the DB or used as a lookup key (AJ, 2026-09-19) — added after
 * two Customer rows for the same real number ("08860756024" from the old
 * plain-text field vs. "+918860756024" from PhoneInput) silently coexisted
 * past `@@unique([organizationId, phone])`, since the constraint compares
 * raw strings, not phone-equivalence. Every write/lookup site must run the
 * value through this first so the same person always maps to the same row,
 * regardless of which form (this one, the storefront intake, admin edit)
 * captured it. Falls back to the input unchanged if it isn't a recognizable
 * 10-digit Indian number, so a malformed value fails validation elsewhere
 * rather than being silently coerced into something wrong.
 */
export function normalizePhone(phone: string): string {
  const last10 = phone.replace(/\D/g, "").slice(-10);
  return last10.length === 10 ? `+91${last10}` : phone;
}
