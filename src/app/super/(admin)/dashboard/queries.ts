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
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "ACTIVE" } }),
    prisma.organization.count({ where: { status: "SUSPENDED" } }),
    prisma.organization.count({ where: { status: "DEACTIVATED" } }),
    prisma.organization.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.subscription.count({ where: { status: "TRIALING", endDate: null } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endDate: null } }),
  ]);

  return {
    totalCaterers,
    activeCaterers,
    suspendedCaterers,
    deactivatedCaterers,
    newRegistrations7d,
    trialSubscriptions,
    activeSubscriptions,
    ordersProcessed: 0, // TODO(Chunk 9/10): real Order entity doesn't exist yet.
    eventsProcessed: 0, // TODO(Chunk 9/10): real Event entity doesn't exist yet.
  };
}
