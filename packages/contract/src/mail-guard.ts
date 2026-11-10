/**
 * Mail guard (AJ, 2026-11-10): until Platterly goes live, a REAL email (ZeptoMail) may only go to AJ's own address, so no customer, caterer or tester ever gets a
 * message from development. Every app asks `mailGuard` before it calls the mail service. The local mail sink (a localhost address) is never restricted, so tests
 * and local runs keep working. The guard is ON by default everywhere, production included: going live means setting `MAIL_GUARD=off` on purpose (a go-live step).
 * `MAIL_GUARD_ALLOW` (comma separated) replaces the default allowed list.
 */
export const MAIL_GUARD_DEFAULT_ALLOWED = ["npjalota@gmail.com"] as const;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type MailGuardVerdict = { allowed: true } | { allowed: false; reason: string };

export function mailGuard(to: string, apiUrl: string, env: Record<string, string | undefined> = process.env): MailGuardVerdict {
  if ((env.MAIL_GUARD ?? "").trim().toLowerCase() === "off") return { allowed: true };
  let host = "";
  try {
    host = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) return { allowed: true };
  const allowed = (env.MAIL_GUARD_ALLOW ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const list = allowed.length > 0 ? allowed : [...MAIL_GUARD_DEFAULT_ALLOWED];
  return list.includes(to.trim().toLowerCase()) ? { allowed: true } : { allowed: false, reason: "Blocked by the mail guard: before go-live real email goes only to the allowed address." };
}
