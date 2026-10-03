import "server-only";
import { prisma } from "@/lib/db";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlatformCounts {
  totalCaterers: number;
  activeCaterers: number;
  suspendedCaterers: number;
  deactivatedCaterers: number;
  newRegistrations7d: number;
  trialSubscriptions: number;
  activeSubscriptions: number;
  // Orders/Events don't exist as entities yet (Chunks 9/10) — stubbed at 0,
  // kept as real fields so this page's shape never has to change once they
  // do (PRD §11's "counts only" subset for Chunk 3; revenue metrics need
  // Chunk 20/24 billing data).
  ordersProcessed: number;
  eventsProcessed: number;
}

// Chunk 3 Group 3.4 — Basic Platform Analytics (PRD §11 subset: counts only).
export async function getPlatformCounts(): Promise<PlatformCounts> {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  const [
    totalCaterers,
    activeCaterers,
    suspendedCaterers,
    deactivatedCaterers,
    newRegistrations7d,
    trialSubscriptions,
    activeSubscriptions,
    ordersProcessed,
    eventsProcessed,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "ACTIVE" } }),
    prisma.organization.count({ where: { status: "SUSPENDED" } }),
    prisma.organization.count({ where: { status: "DEACTIVATED" } }),
    prisma.organization.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.subscription.count({ where: { status: "TRIALING", endDate: null } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endDate: null } }),
    prisma.order.count(),
    prisma.event.count(),
  ]);

  return {
    totalCaterers,
    activeCaterers,
    suspendedCaterers,
    deactivatedCaterers,
    newRegistrations7d,
    trialSubscriptions,
    activeSubscriptions,
    ordersProcessed,
    eventsProcessed,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The newest caterers with the plan each is on, for the Overview. */
export async function getRecentCaterers(limit = 5) {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { subscriptions: { where: { endDate: null }, take: 1, include: { subscriptionPlan: { select: { name: true, isTrial: true } } } } },
  });
  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
    planName: org.subscriptions[0]?.subscriptionPlan.name ?? null,
    isTrial: org.subscriptions[0]?.status === "TRIALING",
  }));
}

/** Trials that end within a week, or already ended without a paid plan, soonest first. */
export async function getTrialsEndingSoon(limit = 5) {
  const subs = await prisma.subscription.findMany({
    where: { status: "TRIALING", endDate: null, trialEndsAt: { not: null, lte: new Date(Date.now() + 7 * DAY_MS) } },
    orderBy: { trialEndsAt: "asc" },
    take: limit,
    include: { organization: { select: { id: true, name: true } } },
  });
  return subs.map((sub) => ({ organizationId: sub.organization.id, name: sub.organization.name, trialEndsAt: sub.trialEndsAt as Date }));
}

/** One row per product: its own caterers, orders and events. Catering is the only product today. */
export async function getProductBreakdown() {
  const counts = await getPlatformCounts();
  return [{ key: "catering", caterers: counts.totalCaterers, orders: counts.ordersProcessed, events: counts.eventsProcessed }];
}

/** Every caterer with its plan and order count, for the Caterers list. */
export async function listCaterersOverview(filter?: { status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" }) {
  const [orgs, orderCounts] = await Promise.all([
    prisma.organization.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { subscriptions: { where: { endDate: null }, take: 1, include: { subscriptionPlan: { select: { name: true } } } } },
    }),
    prisma.order.groupBy({ by: ["organizationId"], _count: { _all: true } }),
  ]);
  const ordersByOrg = new Map(orderCounts.map((row) => [row.organizationId, row._count._all]));
  return orgs.map((org) => {
    const sub = org.subscriptions[0];
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      ownerName: [org.ownerFirstName, org.ownerLastName].filter(Boolean).join(" "),
      email: org.contactEmail,
      createdAt: org.createdAt,
      orders: ordersByOrg.get(org.id) ?? 0,
      planName: sub?.subscriptionPlan.name ?? null,
      trialing: sub?.status === "TRIALING",
      trialEndsAt: sub?.trialEndsAt ?? null,
      setupIncomplete: org.name === "Unnamed Business",
    };
  });
}
