import type { Prisma } from "@/generated/prisma/client";
import type { Session } from "@/lib/session";
import { authorize, type CallerMembership } from "../organisations/permissions";
import { getAccountUser } from "../users/standing";
import { CATALOGUE_KEYS, type AccountOverview, type BusinessSection, type LinkState, type OverviewResult, type ProductKey } from "./types";

// Account read-only data layer. Identity comes ONLY from the `session` argument (the authenticated-session interface); nothing here takes an
// organisation id from the caller, so a request can only ever see the business its own membership points at (isolation by construction). Every
// read of organisation data goes through the F3.2.3 permission map (`org.view`). No write is made here.
export type AccountDb = Pick<Prisma.TransactionClient, "user" | "organisationMember" | "organisationProduct">;

const RANK: Record<string, number> = { active: 0, disabled: 1, removed: 2 };

export async function loadAccountOverview(db: AccountDb, session: Session | null): Promise<OverviewResult> {
  if (!session || !session.userId) return { status: "unauthenticated" };
  try {
    const user = await getAccountUser(db, session.userId);
    // A session for a person who does not exist or is blocked is no session at all.
    if (!user || user.status !== "active") return { status: "unauthenticated" };

    const rows = await db.organisationMember.findMany({
      where: { userId: user.id },
      select: { organisationId: true, centralRole: true, status: true, organisation: { select: { id: true, name: true, status: true } } },
    });
    // One sign-in holds one business: the active membership if there is one, else the most relevant retired one.
    const chosen = [...rows].sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9))[0];
    let business: BusinessSection = { state: "none" };
    if (chosen) {
      const membership = { organisationId: chosen.organisationId, centralRole: "admin", status: chosen.status } as CallerMembership;
      const decision = authorize({ caller: { userId: user.id, emailVerified: user.emailVerified, membership }, action: "org.view", organisationId: chosen.organisationId });
      if (!decision.allowed) {
        business = { state: "forbidden", reason: decision.reason === "member_removed" ? "member_removed" : "member_disabled" };
      } else {
        const links = await db.organisationProduct.findMany({ where: { organisationId: chosen.organisationId }, select: { productKey: true, status: true } });
        const products = Object.fromEntries(CATALOGUE_KEYS.map((k) => [k, "none"])) as Record<ProductKey, LinkState>;
        for (const l of links) if ((CATALOGUE_KEYS as readonly string[]).includes(l.productKey)) products[l.productKey as ProductKey] = l.status === "active" ? "linked" : "suspended";
        business = { state: "ok", business: { id: chosen.organisation.id, name: chosen.organisation.name, status: chosen.organisation.status === "suspended" ? "suspended" : "active", role: "Admin" }, products };
      }
    }
    const overview: AccountOverview = { user: { id: user.id, email: user.email, emailVerified: user.emailVerified }, business };
    return { status: "ok", overview };
  } catch {
    // Nothing from the failure reaches the response: the screens show a generic error.
    return { status: "error" };
  }
}

/** The HTTP shape of a result. 401 unauthenticated, 500 error, 200 otherwise (an empty or forbidden business is still a successful answer). */
export function toResponse(result: OverviewResult): Response {
  const headers = { "cache-control": "no-store" };
  if (result.status === "unauthenticated") return Response.json({ status: "unauthenticated" }, { status: 401, headers });
  if (result.status === "error") return Response.json({ status: "error" }, { status: 500, headers });
  return Response.json(result, { status: 200, headers });
}
