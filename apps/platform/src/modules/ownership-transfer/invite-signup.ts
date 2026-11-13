import { prisma } from "@/lib/db";
import { findTransferByToken, normaliseEmail } from "./transfer";

// A second way to create an account (AJ, 2026-11-10): through an Admin-transfer invitation. The sign-up form sends the page's query string; when it carries
// `invite=<secret link token>`, the identity provider allows the sign-up only if that token is a still-pending, unexpired invitation AND the address being
// registered is exactly the address that was invited. Anything else is refused as before.
export const INVITE_PARAM = "invite";

export const inviteTokenFrom = (query: string | null | undefined): string | null => {
  if (!query || query.length > 4000) return null;
  const token = new URLSearchParams(query).get(INVITE_PARAM);
  return token && token.length >= 20 && token.length <= 200 ? token : null;
};

export async function inviteAllowsSignUp(query: string | null | undefined, email: unknown, now: Date = new Date()): Promise<boolean> {
  const token = inviteTokenFrom(query);
  if (!token || typeof email !== "string") return false;
  try {
    const t = await findTransferByToken(prisma, token);
    return t !== null && t.status === "pending" && t.expiresAt > now && t.nomineeEmail === normaliseEmail(email);
  } catch {
    return false;
  }
}

/** For the sign-up page: whether this query carries a usable invitation (the form then opens instead of the closed card), and the address it is for. */
export async function openInvitation(query: string | null | undefined, now: Date = new Date()): Promise<{ email: string } | null> {
  const token = inviteTokenFrom(query);
  if (!token) return null;
  try {
    const t = await findTransferByToken(prisma, token);
    return t !== null && t.status === "pending" && t.expiresAt > now ? { email: t.nomineeEmail } : null;
  } catch {
    return null;
  }
}
