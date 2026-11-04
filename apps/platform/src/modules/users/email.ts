// Character codes the database CHECK trims from an email: space, tab, line feed, vertical tab, form feed, carriage return.
// The migration writes them as chr(n) calls rather than backslash escapes. PostgreSQL does not document a \v escape in E'' strings, so one may
// mean the letter v (to be verified against a real server in Stage 2, not relied on here). A test builds EMAIL_TRIM_SQL from this list and requires it verbatim in the migration.
export const EMAIL_TRIM_CODES = [32, 9, 10, 11, 12, 13] as const;

export const EMAIL_TRIM_SQL = EMAIL_TRIM_CODES.map((code) => `chr(${code})`).join(" || ");

// Normalises an email for storage: trims leading and trailing JavaScript whitespace (which includes the six above and also
// characters such as the non-breaking space), lower-cases, and returns null when nothing is left or when whitespace remains inside.
// This is the helper's behaviour only. The database CHECK is separate and trims just the six characters above.
// No format validation here: whether it looks like an address is outside F3.1.1.
export function normaliseEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email === "") return null;
  if (/\s/.test(email)) return null;
  return email;
}
