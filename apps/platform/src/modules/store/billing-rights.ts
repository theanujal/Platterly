import "server-only";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import { loadAccountOverview } from "@/modules/account/overview";
import type { OverviewResult } from "@/modules/account/types";
import { pendingBuyerFor, type PendingBuyer } from "./pending-buyer";

/**
 * Who may buy, change or see a business's billing (Gate C, AJ 2026-11-14): the business's active Admin. The Old Admin (a `former_admin` row that stays active and
 * read-only after an Admin transfer) buys nothing and sees no prices or finance. The Account overview treats any active membership as the business's Admin, so
 * every billing door asks here instead. Other roles holding the product's billing access get to view invoices later (F12.1.2); until then only the Admin does.
 * The business is always the signed-in person's own, never one a request names.
 */
export type BillingAccess =
  | { status: "ok"; businessId: string; businessName: string }
  | { status: "unauthenticated" | "no_business" | "not_admin" };

type Deps = {
  overview?: (session: Session) => Promise<OverviewResult>;
  isActiveAdmin?: (userId: string, organisationId: string) => Promise<boolean>;
  /** A person who signed up from a paid plan and has not paid yet (no business, only a reserved id). */
  pending?: (session: Session) => Promise<PendingBuyer | null>;
};

export const isActiveAdminInDb = async (userId: string, organisationId: string) => (await prisma.organisationMember.count({ where: { userId, organisationId, centralRole: "admin", status: "active" } })) > 0;

export async function billingAccess(session: Session | null, deps: Deps = {}): Promise<BillingAccess> {
  if (!session || !session.userId) return { status: "unauthenticated" };
  const overview = await (deps.overview ?? ((s: Session) => loadAccountOverview(prisma, s)))(session);
  if (overview.status !== "ok") return { status: "unauthenticated" };
  const section = overview.overview.business;
  if (section.state !== "ok") {
    const pending = section.state === "none" ? await (deps.pending ?? pendingBuyerFor)(session) : null;
    return pending ? { status: "ok", businessId: pending.businessId, businessName: pending.businessName } : { status: "no_business" };
  }
  const admin = await (deps.isActiveAdmin ?? isActiveAdminInDb)(session.userId, section.business.id);
  return admin ? { status: "ok", businessId: section.business.id, businessName: section.business.name } : { status: "not_admin" };
}
