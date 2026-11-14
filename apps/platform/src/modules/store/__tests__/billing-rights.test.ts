import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/session";
import type { OverviewResult } from "@/modules/account/types";
import { billingAccess } from "../billing-rights";

const session: Session = { userId: "u-1", authenticatedAt: new Date() };
const okBusiness = (id = "biz_1", name = "Spice Route"): OverviewResult =>
  ({ status: "ok", overview: { user: { id: "u-1", email: "a@b.test", emailVerified: true }, business: { state: "ok", business: { id, name, status: "active", role: "Admin" }, products: {}, team: [] } } }) as unknown as OverviewResult;
const noBusiness = { status: "ok", overview: { user: { id: "u-1", email: "a@b.test", emailVerified: true }, business: { state: "none" } } } as unknown as OverviewResult;
const forbidden = { status: "ok", overview: { user: { id: "u-1", email: "a@b.test", emailVerified: true }, business: { state: "forbidden", reason: "member_removed" } } } as unknown as OverviewResult;

const run = (overview: OverviewResult, admin: boolean, s: Session | null = session) => {
  const asked: string[] = [];
  return billingAccess(s, { overview: async () => overview, isActiveAdmin: async (userId, organisationId) => (asked.push(`${userId}:${organisationId}`), admin), pending: async () => null }).then((r) => ({ r, asked }));
};

// Billing is the business Admin's (AJ, 2026-11-14): the Old Admin (a "former_admin" row, still active, read-only) sees no prices or finance and buys nothing.
describe("who may buy and see billing", () => {
  it("the active Admin of the business may, and the business is the person's own, never named by a request", async () => {
    const { r, asked } = await run(okBusiness(), true);
    expect(r).toEqual({ status: "ok", businessId: "biz_1", businessName: "Spice Route" });
    expect(asked).toEqual(["u-1:biz_1"]);
  });

  it("a person who is a member but not the active Admin (the Old Admin) is refused as not_admin", async () => {
    expect((await run(okBusiness(), false)).r).toEqual({ status: "not_admin" });
  });

  it("no session is unauthenticated, and a person with no business, or a removed or disabled one, gets no_business without asking about the role", async () => {
    const signedOut = await run(okBusiness(), true, null);
    expect(signedOut.r).toEqual({ status: "unauthenticated" });
    expect(signedOut.asked).toEqual([]);
    for (const o of [noBusiness, forbidden]) {
      const got = await run(o, true);
      expect(got.r).toEqual({ status: "no_business" });
      expect(got.asked).toEqual([]);
    }
  });

  it("an overview that could not be read is unauthenticated, never a guess in the person's favour", async () => {
    expect((await run({ status: "error" } as OverviewResult, true)).r).toEqual({ status: "unauthenticated" });
  });
});

// A paid-plan sign-up that has not paid has no business, only the id reserved for them (docs/paid-plan-signup-plan.md): the Store treats it as theirs.
describe("a paid-plan sign-up that has not paid yet", () => {
  const pending = { businessId: `biz_${"c".repeat(32)}`, businessName: "Asha Rao", productKey: "caterly", planCode: "premium", interval: "ANNUAL" };
  it("is the buyer for the id reserved for them, found from their own session", async () => {
    const r = await billingAccess(session, { overview: async () => noBusiness, pending: async () => pending });
    expect(r).toEqual({ status: "ok", businessId: pending.businessId, businessName: "Asha Rao" });
  });
  it("is not asked about when the person has a business whose access ended, and a person with nothing pending still has no business", async () => {
    let asked = 0;
    const r = await billingAccess(session, { overview: async () => forbidden, pending: async () => (asked++, pending) });
    expect(r).toEqual({ status: "no_business" });
    expect(asked).toBe(0);
    expect(await billingAccess(session, { overview: async () => noBusiness, pending: async () => null })).toEqual({ status: "no_business" });
  });
});
