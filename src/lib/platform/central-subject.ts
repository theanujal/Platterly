// The central sign-in's person id, remembered for a moment by email. Better Auth creates the Caterly user BEFORE it creates the account row that stores
// this id, so the "after a user is created" hook cannot see it. `fetchPlatterlyUserInfo` (which has just read it from the Account) leaves it here, and the
// hook picks it up. In-process, two minutes, used once: it only decides whether a brand-new central person was already made a member of a business.
const TTL_MS = 2 * 60_000;
const seen = new Map<string, { subject: string; at: number }>();

export function rememberCentralSubject(email: string, subject: string, now = Date.now()): void {
  for (const [key, value] of seen) if (now - value.at > TTL_MS) seen.delete(key);
  seen.set(email.trim().toLowerCase(), { subject, at: now });
}

/** The subject remembered for this email, or null. Removed when taken. */
export function takeCentralSubject(email: string, now = Date.now()): string | null {
  const key = email.trim().toLowerCase();
  const found = seen.get(key);
  seen.delete(key);
  return found && now - found.at <= TTL_MS ? found.subject : null;
}
