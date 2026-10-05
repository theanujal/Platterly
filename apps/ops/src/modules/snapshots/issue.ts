import "server-only";
import { newId, type EntitlementSnapshot, type EntitlementValues } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { sendCommand } from "@/modules/commands/outbox";

/** How long a snapshot is trusted without a refresh (docs/ops-contract.md section 5). Ops refreshes every day, well inside it. */
export const SNAPSHOT_VALID_DAYS = 7;
export const REFRESH_AFTER_HOURS = 24;
const DAY = 86_400_000;

type Row = {
  id: string;
  status: EntitlementSnapshot["status"];
  billingInterval: "MONTHLY" | "ANNUAL" | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  plan: { code: string; name: string; entitlements: unknown };
};

export function buildSnapshot(sub: Row, businessId: string, productKey: string, version: number, now: Date = new Date()): EntitlementSnapshot {
  return {
    businessId,
    productKey,
    subscriptionId: sub.id,
    version,
    plan: { code: sub.plan.code, name: sub.plan.name },
    status: sub.status,
    interval: sub.billingInterval,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    entitlements: (sub.plan.entitlements ?? {}) as EntitlementValues,
    issuedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + SNAPSHOT_VALID_DAYS * DAY).toISOString(),
  };
}

export async function currentSubscription(businessId: string, productKey: string) {
  return prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null }, include: { plan: true } });
}

/** Uses up the next version number and builds the snapshot, without sending it (provisioning carries the first one inside its own command). */
export async function prepareSnapshot(businessId: string, productKey: string, now: Date = new Date()): Promise<EntitlementSnapshot | null> {
  const sub = await currentSubscription(businessId, productKey);
  if (!sub) return null;
  const link = await prisma.businessProduct.update({ where: { businessId_productKey: { businessId, productKey } }, data: { snapshotVersion: { increment: 1 }, snapshotIssuedAt: now }, select: { snapshotVersion: true } });
  return buildSnapshot(sub, businessId, productKey, link.snapshotVersion, now);
}

/**
 * Builds the next snapshot (version +1) from the business's current subscription and sends it to the product as a
 * `snapshot.push` command (queued first, so an unreachable product just retries). Returns null when the business has no
 * current subscription (nothing to issue; the version is not used up).
 */
export async function issueSnapshot(businessId: string, productKey: string, now: Date = new Date()): Promise<EntitlementSnapshot | null> {
  const snapshot = await prepareSnapshot(businessId, productKey, now);
  if (!snapshot) return null;
  const link = { snapshotVersion: snapshot.version };
  await sendCommand({ productKey, dedupeKey: `snapshot:${businessId}:${productKey}:${link.snapshotVersion}`, command: { type: "snapshot.push", businessId, payload: { snapshot } } });
  return snapshot;
}

/**
 * What a product gets when it pulls (the backup to pushes). It carries the version already issued, so a pull never
 * outranks a push. A business never issued one yet is issued its first now.
 */
export async function currentSnapshot(businessId: string, productKey: string, now: Date = new Date()): Promise<EntitlementSnapshot | null> {
  const sub = await currentSubscription(businessId, productKey);
  if (!sub) return null;
  const link = await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } } });
  if (!link) return null;
  if (link.snapshotVersion === 0) return issueSnapshot(businessId, productKey, now);
  return buildSnapshot(sub, businessId, productKey, link.snapshotVersion, now);
}

/** Every current subscription on a plan gets a new snapshot (a plan's limits changed). */
export async function reissueForPlan(planId: string, now: Date = new Date()): Promise<number> {
  const subs = await prisma.subscription.findMany({ where: { planId, endDate: null }, select: { businessId: true, productKey: true } });
  let issued = 0;
  for (const sub of subs) {
    try {
      if (await issueSnapshot(sub.businessId, sub.productKey, now)) issued += 1;
    } catch (error) {
      console.error("[ops snapshots] could not reissue for", sub.businessId, error);
    }
  }
  return issued;
}

/** The daily refresh: any current subscription whose snapshot is older than a day (or was never issued) is issued again. */
export async function refreshDueSnapshots(now: Date = new Date(), limit = 200, productKey?: string): Promise<number> {
  const cutoff = new Date(now.getTime() - REFRESH_AFTER_HOURS * 3_600_000);
  const due = await prisma.businessProduct.findMany({
    where: { ...(productKey ? { productKey } : {}), OR: [{ snapshotIssuedAt: null }, { snapshotIssuedAt: { lt: cutoff } }], business: { subscriptions: { some: { endDate: null } } } },
    orderBy: { snapshotIssuedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { businessId: true, productKey: true },
  });
  let issued = 0;
  for (const link of due) {
    try {
      // The business may have a subscription to another product only; issueSnapshot returns null when this product has none.
      if (await issueSnapshot(link.businessId, link.productKey, now)) issued += 1;
    } catch (error) {
      console.error("[ops snapshots] could not refresh", link.businessId, error);
    }
  }
  return issued;
}

export const newSubscriptionId = () => newId("subscription");
