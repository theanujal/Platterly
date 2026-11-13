// F3.2.3 central permission map (docs/platform-foundation-plan.md, Part 3 section 4, as annotated by Revision 11 note R11-16).
// Central permissions only: Caterly's own roles, overrides and sensitive keys stay inside Caterly and are not reachable from here, because the
// action list is closed and `authorize` refuses anything outside it.
//
// There is ONE central role, the Business Admin (C5, C6). The old Owner/Admin/Manager/Member columns are superseded. Rows whose answer depends on
// an open decision are marked PENDING and FAIL CLOSED: `authorize` refuses them with reason `pending_decision` until AJ decides:
//   Decision M / O-D3ROWS  which Owner-only rows apply to the Business Admin (suspend/unlink a product, billing, invoices)
//   ADM-12                 the exact list of other sensitive Admin actions, and the freshness windows
//   ADM-07                 whether "Admin cannot touch Admin" is retained (moot while exactly one Admin exists and no action targets a member)
// Fresh authentication: real `max_age` enforcement needs the session's authentication time, which waits on D1/D2 and F4. This module only
// provides the predicate (`isFresh`) and applies it when the caller supplies the time AND a window; it does not claim enforcement.

export const ACTIONS = [
  "org.create",
  "org.view",
  "org.edit",
  "product.activate",
  "product.unlink",
  "billing.view",
  "billing.manage",
  "ownership.transfer",
  "ownership.cancel",
  "ownership.decline",
  "profile.manage",
  "org.delete",
  "member.invite",
  "member.remove",
  "member.role.assign",
] as const;
export type Action = (typeof ACTIONS)[number];

type Rule =
  | { kind: "admin"; freshAuth: boolean | "pending"; note: string }
  | { kind: "pending"; freshAuth: boolean | "pending"; note: string }
  | { kind: "any_verified_user"; freshAuth: false; note: string }
  | { kind: "any_signed_in_user"; freshAuth: false; note: string }
  | { kind: "nominee"; freshAuth: false; note: string }
  | { kind: "unavailable"; freshAuth: false; note: string };

export const PERMISSIONS: Readonly<Record<Action, Rule>> = {
  "org.create": { kind: "any_verified_user", freshAuth: false, note: "The creator becomes the Admin (O1); capped at one place per product by the slot rules." },
  "org.view": { kind: "admin", freshAuth: false, note: "Central view by the Business Admin. Whether any non-Admin sees central screens is not decided." },
  "org.edit": { kind: "admin", freshAuth: false, note: "Derived from Admin rule 4." },
  "product.activate": { kind: "admin", freshAuth: false, note: "Derived. The paid-activation billing right (M2) is pending and is not granted here." },
  "product.unlink": { kind: "pending", freshAuth: "pending", note: "PENDING Decision M / O-D3ROWS." },
  "billing.view": { kind: "pending", freshAuth: "pending", note: "PENDING Decision M / O-D3ROWS." },
  "billing.manage": { kind: "pending", freshAuth: "pending", note: "PENDING Decision M / O-D3ROWS (covers subscription, billing details, plan changes)." },
  "ownership.transfer": { kind: "admin", freshAuth: true, note: "Decided by AJ (2026-11-10): the Business Admin invites the next Admin. Fresh authentication is kept (C14)." },
  "ownership.cancel": { kind: "admin", freshAuth: true, note: "The initiator cancels a pending transfer, with fresh authentication (X5, C14)." },
  "ownership.decline": { kind: "nominee", freshAuth: false, note: "The nominee declines, in a normal authenticated session (C14)." },
  "profile.manage": { kind: "any_signed_in_user", freshAuth: false, note: "Everyone manages their own profile and security." },
  "org.delete": { kind: "unavailable", freshAuth: false, note: "Not available in Account. Staff only, manual." },
  "member.invite": { kind: "unavailable", freshAuth: false, note: "SUPERSEDED: no central employee invitations (C5, C6)." },
  "member.remove": { kind: "unavailable", freshAuth: false, note: "SUPERSEDED for employees; removal of the previous Admin only under approved B2 exceptions." },
  "member.role.assign": { kind: "unavailable", freshAuth: false, note: "SUPERSEDED: one central role (P3)." },
};

export type CallerMembership = { organisationId: string; centralRole: "admin" | "former_admin"; status: "active" | "disabled" | "removed" };
export type Caller = {
  /** Null for a request with no signed-in user. */
  userId: string | null;
  emailVerified?: boolean;
  /** The caller's membership in the organisation being acted on (if any). A membership in a different organisation grants nothing here. */
  membership?: CallerMembership | null;
  /** When the caller last authenticated, for the fresh-authentication predicate. */
  authenticatedAt?: Date;
  /** True when the caller is the nominee of the transfer being declined (the caller of `ownership.decline` must prove it from the transfer record). */
  isNominee?: boolean;
};

export type DenyReason =
  | "unknown_action"
  | "not_signed_in"
  | "email_not_verified"
  | "not_a_member"
  | "member_disabled"
  | "member_removed"
  | "other_organisation"
  | "pending_decision"
  | "action_unavailable"
  | "not_nominee"
  | "fresh_auth_required";

export type Decision = { allowed: true } | { allowed: false; reason: DenyReason };
const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

/** True when `authenticatedAt` is within `maxAgeSeconds` of `now`. The window is supplied by the caller: the real windows are open (ADM-12). */
export function isFresh(authenticatedAt: Date | undefined, now: Date, maxAgeSeconds: number): boolean {
  if (!authenticatedAt || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) return false;
  const age = (now.getTime() - authenticatedAt.getTime()) / 1000;
  return age >= 0 && age <= maxAgeSeconds;
}

export type AuthorizeInput = {
  caller: Caller;
  action: string;
  /** The organisation the action targets. Omit for actions that are not about an organisation (`org.create`, `profile.manage`). */
  organisationId?: string;
  now?: Date;
  /** Required for an action that needs fresh authentication; there is no default because the windows are open (ADM-12). */
  freshMaxAgeSeconds?: number;
};

export function authorize(input: AuthorizeInput): Decision {
  if (!(ACTIONS as readonly string[]).includes(input.action)) return deny("unknown_action");
  const action = input.action as Action;
  const rule = PERMISSIONS[action];
  const { caller } = input;
  if (rule.kind === "unavailable") return deny("action_unavailable");
  if (!caller.userId) return deny("not_signed_in");
  if (rule.kind === "any_signed_in_user") return { allowed: true };
  if (rule.kind === "any_verified_user") return caller.emailVerified === true ? { allowed: true } : deny("email_not_verified");
  if (rule.kind === "nominee") return caller.isNominee === true ? { allowed: true } : deny("not_nominee");

  // Organisation-scoped actions below: membership is checked first, so a pending row never reveals anything to a non-member.
  const m = caller.membership;
  if (!m) return deny("not_a_member");
  if (input.organisationId === undefined || m.organisationId !== input.organisationId) return deny("other_organisation");
  if (m.centralRole !== "admin") return deny("not_a_member");
  if (m.status === "disabled") return deny("member_disabled");
  if (m.status === "removed") return deny("member_removed");
  if (rule.kind === "pending") return deny("pending_decision");
  if (rule.freshAuth === true) {
    const now = input.now ?? new Date();
    if (input.freshMaxAgeSeconds === undefined || !isFresh(caller.authenticatedAt, now, input.freshMaxAgeSeconds)) return deny("fresh_auth_required");
  }
  return { allowed: true };
}
