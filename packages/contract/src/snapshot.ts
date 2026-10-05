import { isId, isProductKey } from "./ids";
import { validateEntitlements, type EntitlementDef, type EntitlementValue, type EntitlementValues } from "./manifest";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "./result";
import { BILLING_INTERVALS, GRACE_DAYS, SUBSCRIPTION_STATUSES, type BillingInterval, type SubscriptionStatus } from "./version";

/**
 * The small record a product stores locally and checks on every request, so no call to ops sits on the hot path.
 * Ops pushes a new one on every change; `version` only goes up.
 */
export interface EntitlementSnapshot {
  businessId: string;
  productKey: string;
  subscriptionId: string;
  version: number;
  plan: { code: string; name: string };
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  entitlements: EntitlementValues;
  issuedAt: string;
  validUntil: string;
}

function optionalDate(value: unknown, name: string): ParseResult<string | null> {
  if (value === null || value === undefined) return ok(null);
  return isIsoDate(value) ? ok(value) : fail(`${name} must be an ISO date`);
}

/** `defs` (the product's manifest entitlements) is optional: pass it to also reject unknown keys and wrong types. */
export function parseSnapshot(input: unknown, defs?: readonly EntitlementDef[]): ParseResult<EntitlementSnapshot> {
  if (!isRecord(input)) return fail("snapshot must be an object");
  if (!isId("business", input.businessId)) return fail("businessId is invalid");
  if (!isProductKey(input.productKey)) return fail("productKey is invalid");
  if (!isId("subscription", input.subscriptionId)) return fail("subscriptionId is invalid");
  if (!Number.isInteger(input.version) || (input.version as number) < 1) return fail("version must be a positive whole number");
  if (!isRecord(input.plan) || typeof input.plan.code !== "string" || typeof input.plan.name !== "string") return fail("plan needs code and name");
  if (!SUBSCRIPTION_STATUSES.includes(input.status as SubscriptionStatus)) return fail("status is invalid");
  if (input.interval !== null && input.interval !== undefined && !BILLING_INTERVALS.includes(input.interval as BillingInterval)) return fail("interval is invalid");
  const periodEnd = optionalDate(input.currentPeriodEnd, "currentPeriodEnd");
  if (!periodEnd.ok) return periodEnd;
  const trialEnd = optionalDate(input.trialEndsAt, "trialEndsAt");
  if (!trialEnd.ok) return trialEnd;
  if (!isIsoDate(input.issuedAt)) return fail("issuedAt must be an ISO date");
  if (!isIsoDate(input.validUntil)) return fail("validUntil must be an ISO date");
  if (Date.parse(input.validUntil) < Date.parse(input.issuedAt)) return fail("validUntil is before issuedAt");

  let entitlements: EntitlementValues;
  if (defs) {
    const checked = validateEntitlements(defs, input.entitlements);
    if (!checked.ok) return checked;
    entitlements = checked.value;
  } else if (isRecord(input.entitlements)) {
    entitlements = input.entitlements as EntitlementValues;
  } else {
    return fail("entitlements must be an object");
  }

  return ok({
    businessId: input.businessId,
    productKey: input.productKey,
    subscriptionId: input.subscriptionId,
    version: input.version as number,
    plan: { code: input.plan.code, name: input.plan.name },
    status: input.status as SubscriptionStatus,
    interval: (input.interval as BillingInterval | null | undefined) ?? null,
    currentPeriodEnd: periodEnd.value,
    trialEndsAt: trialEnd.value,
    entitlements,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
  });
}

/** A snapshot replaces the stored one only when its version is higher (a late or repeated push is ignored). */
export function isNewerSnapshot(incoming: Pick<EntitlementSnapshot, "version">, current: Pick<EntitlementSnapshot, "version"> | null): boolean {
  return current === null || incoming.version > current.version;
}

export type AccessDecision =
  | { allowed: true; stale: boolean }
  | { allowed: false; reason: "missing" | "locked" | "cancelled" | "trial_ended" | "period_ended" | "expired" };

/**
 * Can the business use the product right now? Rules (docs/ops-contract.md section 5):
 * - no snapshot: locked
 * - LOCKED / CANCELLED: locked at once, grace never applies to an explicit lock
 * - TRIALING with a passed `trialEndsAt`, ACTIVE with a passed `currentPeriodEnd`: locked at once, by the snapshot's own dates
 *   (section 8.2), so a trial or paid period ends at the right minute even if ops is down. A missing date never locks.
 * - TRIALING, ACTIVE, PAST_DUE: allowed until `validUntil`, then allowed for `graceDays` more (stale) when ops is silent, then locked
 */
export function evaluateAccess(snapshot: EntitlementSnapshot | null, now: Date = new Date(), graceDays: number = GRACE_DAYS): AccessDecision {
  if (!snapshot) return { allowed: false, reason: "missing" };
  if (snapshot.status === "LOCKED") return { allowed: false, reason: "locked" };
  if (snapshot.status === "CANCELLED") return { allowed: false, reason: "cancelled" };
  if (snapshot.status === "TRIALING" && snapshot.trialEndsAt && Date.parse(snapshot.trialEndsAt) <= now.getTime()) return { allowed: false, reason: "trial_ended" };
  if (snapshot.status === "ACTIVE" && snapshot.currentPeriodEnd && Date.parse(snapshot.currentPeriodEnd) <= now.getTime()) return { allowed: false, reason: "period_ended" };
  const validUntil = Date.parse(snapshot.validUntil);
  if (now.getTime() <= validUntil) return { allowed: true, stale: false };
  if (now.getTime() <= validUntil + graceDays * 86_400_000) return { allowed: true, stale: true };
  return { allowed: false, reason: "expired" };
}

/** A limit: a number, null for unlimited, or undefined when the snapshot has no such key (callers decide what that means). */
export function getLimit(snapshot: EntitlementSnapshot | null, key: string): number | null | undefined {
  if (!snapshot || !(key in snapshot.entitlements)) return undefined;
  const value: EntitlementValue = snapshot.entitlements[key];
  return typeof value === "number" || value === null ? value : undefined;
}

export function isFlagOn(snapshot: EntitlementSnapshot | null, key: string): boolean {
  return snapshot?.entitlements[key] === true;
}

/** True when adding one more would stay within the limit. A null limit is unlimited; a missing key blocks nothing (same as today's `assertWithinPlanLimit`). */
export function isWithinLimit(snapshot: EntitlementSnapshot | null, key: string, used: number): boolean {
  const limit = getLimit(snapshot, key);
  if (limit === undefined || limit === null) return true;
  return used < limit;
}
