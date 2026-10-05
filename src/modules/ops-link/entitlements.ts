import "server-only";
import { evaluateAccess, parseSnapshot, type EntitlementSnapshot, type EntitlementValue, type EntitlementValues, type SubscriptionStatus } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { billingLockReason, type BillingLockReason } from "@/modules/subscriptions/billing-math";
import { getCurrentSubscription } from "@/modules/subscriptions/subscription";
import { opsBillingOn, opsLink } from "./config";
import { buildManifest, CATERING_ENTITLEMENTS } from "./manifest";

/**
 * What a kitchen is allowed to do, in one place (docs/ops-contract.md section 5). Every plan limit, the multiple-locations
 * flag and the lock screen ask here instead of reading the plan tables themselves.
 *
 * Two sources, in this order:
 *  1. the entitlement snapshot Platterly Ops sent for the kitchen (`ops_snapshot`), when the ops link is on and OPS_BILLING=1;
 *  2. otherwise the kitchen's own Subscription and Plan rows, shaped the same way ("plan" source).
 * With OPS_BILLING off (the default) every answer comes from the plan rows exactly as before, however many snapshots ops has sent.
 *
 * With OPS_BILLING on and no snapshot yet (docs/ops-contract.md 8.3):
 *  - a kitchen that has its own subscription rows stays on them (ops has not issued for it yet);
 *  - a brand-new kitchen (no rows at all) gets the manifest's trial defaults for its first 24 hours, so sign-up never
 *    waits on ops, and after that is treated as missing, which locks it.
 */
export interface EntitlementView {
  source: "ops" | "plan";
  /** The contract's status. For a snapshot it is the snapshot's own; for plan rows it is derived. */
  status: SubscriptionStatus;
  /** True when the kitchen must see only the payment page (and, publicly, is switched off). */
  locked: boolean;
  /** Running on an old snapshot in the grace period because ops has been silent. */
  stale: boolean;
  planName: string | null;
  values: EntitlementValues;
  /** Why it is locked (the lock screen's wording), or null when it is not. */
  lockReason: BillingLockReason | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/** How long a brand-new kitchen runs on the trial defaults while it waits for its first snapshot from ops. */
export const FIRST_SNAPSHOT_WINDOW_HOURS = 24;

const LIMIT_KEYS = CATERING_ENTITLEMENTS.filter((e) => e.type === "limit").map((e) => e.key);

/** A limit: a number, null for unlimited, or undefined when this source has no such key. */
export function limitOf(view: EntitlementView, key: string): number | null | undefined {
  if (!(key in view.values)) return undefined;
  const value: EntitlementValue = view.values[key];
  return typeof value === "number" || value === null ? value : undefined;
}

export function flagOf(view: EntitlementView, key: string): boolean {
  return view.values[key] === true;
}

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof getCurrentSubscription>>>;
type PlanLockInput = Pick<SubscriptionRow, "status" | "trialEndsAt" | "currentPeriodEnd">;

/** The plan rows, shaped as a view. No subscription at all is open (as before) but has no multiple-locations flag. */
export function viewFromPlan(subscription: (PlanLockInput & { subscriptionPlan: SubscriptionRow["subscriptionPlan"] }) | null, now: Date = new Date()): EntitlementView {
  const values: EntitlementValues = Object.fromEntries(LIMIT_KEYS.map((key) => [key, null]));
  values.multiLocation = false;
  if (!subscription) return { source: "plan", status: "ACTIVE", locked: false, stale: false, planName: null, values, lockReason: null, trialEndsAt: null, currentPeriodEnd: null };

  const plan = subscription.subscriptionPlan as unknown as Record<string, unknown>;
  for (const key of LIMIT_KEYS) values[key] = (plan[key] as number | null | undefined) ?? null;
  values.multiLocation = plan.multiLocation === true;

  const reason = billingLockReason(subscription, now);
  const status: SubscriptionStatus = reason === "ended" ? "CANCELLED" : reason ? "LOCKED" : subscription.status === "TRIALING" ? "TRIALING" : "ACTIVE";
  return { source: "plan", status, locked: reason !== null, stale: false, planName: subscription.subscriptionPlan.name, values, lockReason: reason, trialEndsAt: subscription.trialEndsAt, currentPeriodEnd: subscription.currentPeriodEnd };
}

export function viewFromSnapshot(snapshot: EntitlementSnapshot, now: Date = new Date()): EntitlementView {
  const access = evaluateAccess(snapshot, now);
  const lockReason: BillingLockReason | null = access.allowed ? null : access.reason === "trial_ended" ? "trial_ended" : access.reason === "period_ended" ? "period_ended" : "ended";
  return {
    source: "ops",
    status: snapshot.status,
    locked: !access.allowed,
    stale: access.allowed && access.stale,
    planName: snapshot.plan.name,
    values: snapshot.entitlements,
    lockReason,
    trialEndsAt: snapshot.trialEndsAt ? new Date(snapshot.trialEndsAt) : null,
    currentPeriodEnd: snapshot.currentPeriodEnd ? new Date(snapshot.currentPeriodEnd) : null,
  };
}

/**
 * A kitchen with no snapshot and no subscription rows of its own (created after the cutover, ops has not issued yet): the
 * manifest's trial defaults while it is new, a lock once it is not. Never reached while OPS_BILLING is off.
 */
export function viewForNewKitchen(createdAt: Date, now: Date = new Date()): EntitlementView {
  const manifest = buildManifest(opsLink()?.productKey ?? "catering");
  const windowEnds = createdAt.getTime() + FIRST_SNAPSHOT_WINDOW_HOURS * 3_600_000;
  if (now.getTime() < windowEnds) {
    return { source: "ops", status: "TRIALING", locked: false, stale: false, planName: "Trial", values: manifest.trial.entitlements, lockReason: null, trialEndsAt: new Date(createdAt.getTime() + manifest.trial.days * 86_400_000), currentPeriodEnd: null };
  }
  return { source: "ops", status: "LOCKED", locked: true, stale: false, planName: null, values: manifest.trial.entitlements, lockReason: "ended", trialEndsAt: null, currentPeriodEnd: null };
}

/** The stored snapshot, if it is valid for this product. A damaged one is ignored (and logged) so a bad push can never lock everyone out by accident. */
function readSnapshot(data: unknown): EntitlementSnapshot | null {
  const parsed = parseSnapshot(data, CATERING_ENTITLEMENTS);
  if (!parsed.ok) {
    console.error("[ops-link] ignoring an invalid stored snapshot:", parsed.error);
    return null;
  }
  return parsed.value;
}

export async function getEntitlements(organizationId: string, now: Date = new Date()): Promise<EntitlementView> {
  if (opsBillingOn()) {
    const row = await prisma.opsSnapshot.findUnique({ where: { organizationId } });
    const snapshot = row ? readSnapshot(row.data) : null;
    if (snapshot) return viewFromSnapshot(snapshot, now);
    const subscription = await getCurrentSubscription(organizationId);
    if (subscription) return viewFromPlan(subscription, now);
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { createdAt: true } });
    return viewForNewKitchen(org?.createdAt ?? new Date(0), now);
  }
  return viewFromPlan(await getCurrentSubscription(organizationId), now);
}

export async function isLocked(organizationId: string, now: Date = new Date()): Promise<boolean> {
  return (await getEntitlements(organizationId, now)).locked;
}

/** Many kitchens at once (the sitemap): one query for the snapshots instead of one per kitchen. */
export async function lockedOrganizationIds(kitchens: { id: string; createdAt: Date; subscription: Parameters<typeof viewFromPlan>[0] }[], now: Date = new Date()): Promise<Set<string>> {
  const snapshots = new Map<string, EntitlementSnapshot>();
  if (opsBillingOn() && kitchens.length > 0) {
    const rows = await prisma.opsSnapshot.findMany({ where: { organizationId: { in: kitchens.map((k) => k.id) } } });
    for (const row of rows) {
      const snapshot = row.organizationId ? readSnapshot(row.data) : null;
      if (snapshot && row.organizationId) snapshots.set(row.organizationId, snapshot);
    }
  }
  const locked = new Set<string>();
  for (const kitchen of kitchens) {
    const snapshot = snapshots.get(kitchen.id);
    const view = snapshot ? viewFromSnapshot(snapshot, now) : opsBillingOn() && !kitchen.subscription ? viewForNewKitchen(kitchen.createdAt, now) : viewFromPlan(kitchen.subscription, now);
    if (view.locked) locked.add(kitchen.id);
  }
  return locked;
}
