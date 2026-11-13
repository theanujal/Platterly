import { describe, expect, it } from "vitest";
import { ACTIONS, PERMISSIONS, authorize, isFresh, type Action, type Caller, type DenyReason } from "../permissions";

const ORG = "biz_" + "a".repeat(32);
const OTHER = "biz_" + "b".repeat(32);
const now = new Date("2026-11-06T12:00:00Z");
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

const admin = (status: "active" | "disabled" | "removed", organisationId = ORG): Caller => ({ userId: "u1", emailVerified: true, membership: { organisationId, centralRole: "admin", status }, authenticatedAt: secondsAgo(10) });
const nonMember: Caller = { userId: "u2", emailVerified: true, membership: null };
const anonymous: Caller = { userId: null };
const orgScoped = ACTIONS.filter((a) => ["admin", "pending"].includes(PERMISSIONS[a].kind));

const run = (caller: Caller, action: string, extra: Partial<Parameters<typeof authorize>[0]> = {}) => authorize({ caller, action, organisationId: ORG, now, freshMaxAgeSeconds: 300, ...extra });
const reason = (d: ReturnType<typeof authorize>): string => (d.allowed ? "allowed" : d.reason);

describe("the permission map", () => {
  it("covers exactly the closed list of central actions, each with a rule and a note", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...ACTIONS].sort());
    for (const a of ACTIONS) expect(PERMISSIONS[a].note.length, a).toBeGreaterThan(10);
  });

  it("has no action that reaches a product's own roles, overrides or sensitive keys", () => {
    for (const a of ACTIONS) expect(a, a).toMatch(/^(org|product|billing|ownership|profile|member)\./);
    expect(ACTIONS.filter((a) => /caterly|rivo|kitchen|sensitive|override/i.test(a))).toEqual([]);
  });

  it("refuses anything outside the list (fail closed)", () => {
    for (const bogus of ["", "org.admin", "caterly.sensitive.read", "*", "org.view ", "__proto__", "toString"]) {
      expect(reason(run(admin("active"), bogus)), bogus).toBe("unknown_action");
    }
  });

  it("every Owner-only row that remains has fresh authentication recorded", () => {
    expect(PERMISSIONS["ownership.transfer"].freshAuth).toBe(true);
    expect(PERMISSIONS["ownership.cancel"].freshAuth).toBe(true);
    for (const a of ["product.unlink", "billing.manage", "billing.view"] as Action[]) expect(PERMISSIONS[a].freshAuth, a).toBe("pending");
  });
});

describe("matrix: caller state x organisation-scoped action", () => {
  const cases: [string, Caller, (a: Action) => string][] = [
    ["active Admin of this business", admin("active"), (a) => (PERMISSIONS[a].kind === "pending" ? "pending_decision" : "allowed")],
    ["disabled former Admin of this business", admin("disabled"), () => "member_disabled"],
    ["removed Admin of this business", admin("removed"), () => "member_removed"],
    ["active Admin of ANOTHER business", admin("active", OTHER), () => "other_organisation"],
    ["signed-in non-member", nonMember, () => "not_a_member"],
    ["not signed in", anonymous, () => "not_signed_in"],
  ];
  for (const [label, caller, expected] of cases) {
    for (const action of orgScoped) {
      // ownership.cancel and org.* are fresh-auth or plain; the Admin's authentication here is 10 s old, inside the 300 s window.
      it(`${label} -> ${action}`, () => expect(reason(run(caller, action))).toBe(expected(action)));
    }
  }

  it("an organisation-scoped action with no organisation named is refused", () => {
    expect(reason(authorize({ caller: admin("active"), action: "org.edit", now }))).toBe("other_organisation");
  });
});

describe("actions that need no membership", () => {
  it("org.create needs a signed-in, verified user (and no organisation)", () => {
    expect(reason(authorize({ caller: { userId: "u", emailVerified: true }, action: "org.create" }))).toBe("allowed");
    expect(reason(authorize({ caller: { userId: "u", emailVerified: false }, action: "org.create" }))).toBe("email_not_verified");
    expect(reason(authorize({ caller: anonymous, action: "org.create" }))).toBe("not_signed_in");
  });
  it("profile.manage needs only a signed-in user", () => {
    expect(reason(authorize({ caller: { userId: "u" }, action: "profile.manage" }))).toBe("allowed");
    expect(reason(authorize({ caller: anonymous, action: "profile.manage" }))).toBe("not_signed_in");
  });
  it("ownership.decline is for the nominee only", () => {
    expect(reason(authorize({ caller: { userId: "u", isNominee: true }, action: "ownership.decline" }))).toBe("allowed");
    expect(reason(authorize({ caller: { userId: "u" }, action: "ownership.decline" }))).toBe("not_nominee");
    expect(reason(authorize({ caller: anonymous, action: "ownership.decline" }))).toBe("not_signed_in");
  });
  it.each(["org.delete", "member.invite", "member.remove", "member.role.assign"])("%s is unavailable to everyone, the Admin included", (action) => {
    for (const caller of [admin("active"), nonMember, anonymous]) expect(reason(run(caller, action))).toBe("action_unavailable");
  });
});

describe("ownership transfer and the former Admin", () => {
  const former: Caller = { userId: "u1", emailVerified: true, membership: { organisationId: ORG, centralRole: "former_admin", status: "active" }, authenticatedAt: secondsAgo(10) };
  it("the active Admin may start a transfer with fresh authentication only", () => {
    expect(reason(run(admin("active"), "ownership.transfer"))).toBe("allowed");
    expect(reason(run({ ...admin("active"), authenticatedAt: secondsAgo(4000) }, "ownership.transfer"))).toBe("fresh_auth_required");
  });
  it("a former Admin (active, read-only) is refused every organisation action, the Store and billing included", () => {
    for (const a of ["org.view", "org.edit", "product.activate", "product.unlink", "billing.view", "billing.manage", "ownership.transfer", "ownership.cancel"]) expect(reason(run(former, a)), a).toBe("not_a_member");
  });
});

describe("pending decisions stay closed", () => {
  it.each(["product.unlink", "billing.view", "billing.manage"])("%s is refused even to the active Admin until AJ decides", (action) => {
    expect(reason(run(admin("active"), action))).toBe("pending_decision");
  });
  it("a pending row never tells a non-member anything beyond 'not a member'", () => {
    expect(reason(run(nonMember, "billing.manage"))).toBe("not_a_member");
    expect(reason(run(admin("active", OTHER), "billing.manage"))).toBe("other_organisation");
  });
});

describe("fresh authentication predicate (ownership.cancel is the one decided row that needs it)", () => {
  it("isFresh: inside the window, at the edge, outside it, in the future, and missing", () => {
    expect(isFresh(secondsAgo(10), now, 300)).toBe(true);
    expect(isFresh(secondsAgo(300), now, 300)).toBe(true);
    expect(isFresh(secondsAgo(301), now, 300)).toBe(false);
    expect(isFresh(new Date(now.getTime() + 5000), now, 300)).toBe(false);
    expect(isFresh(undefined, now, 300)).toBe(false);
    expect(isFresh(secondsAgo(1), now, Number.NaN)).toBe(false);
    expect(isFresh(secondsAgo(1), now, -1)).toBe(false);
  });
  it("ownership.cancel needs a recent authentication time AND a supplied window", () => {
    expect(reason(run(admin("active"), "ownership.cancel"))).toBe("allowed");
    expect(reason(run({ ...admin("active"), authenticatedAt: secondsAgo(900) }, "ownership.cancel"))).toBe("fresh_auth_required");
    expect(reason(run({ ...admin("active"), authenticatedAt: undefined }, "ownership.cancel"))).toBe("fresh_auth_required");
    expect(reason(run(admin("active"), "ownership.cancel", { freshMaxAgeSeconds: undefined }))).toBe("fresh_auth_required");
  });
  it("a plain row does not ask for fresh authentication", () => {
    expect(reason(run({ ...admin("active"), authenticatedAt: undefined }, "org.edit"))).toBe("allowed");
  });
});
