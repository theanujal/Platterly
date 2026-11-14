import "server-only";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import { ensureOpsRegistration, findPendingSignup } from "../organisations/paid-signup-run";
import { findSubjectForUser } from "../users/subject";

/**
 * A person who signed up from a paid plan and has not paid yet has no business, only the id reserved for them (docs/paid-plan-signup-plan.md). The Store treats them as the
 * buyer for that reserved business: it is always the signed-in person's own, found from their session, never one a request names. Ops is told the business and product (no plan,
 * no trial) so the checkout has something to attach the payment to; that call is safe to repeat, and if it fails the checkout says the business is not ready yet.
 */
export type PendingBuyer = { businessId: string; businessName: string; productKey: string; planCode: string | null; interval: string | null };

export async function pendingBuyerFor(session: Session | null): Promise<PendingBuyer | null> {
  if (!session?.userId) return null;
  const subject = await findSubjectForUser(prisma, session.userId);
  const pending = subject ? await findPendingSignup(subject) : null;
  if (!pending) return null;
  await ensureOpsRegistration(pending).catch(() => false);
  return { businessId: pending.reservedBusinessId, businessName: pending.name, productKey: pending.productKey, planCode: pending.planCode, interval: pending.interval };
}
