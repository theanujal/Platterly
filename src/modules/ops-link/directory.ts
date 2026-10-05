import "server-only";
import { prisma } from "@/lib/db";

/** What ops may read about a business: summaries only, never customers, orders or payments themselves. */
export async function usageCounts(organizationId: string): Promise<Record<string, number>> {
  const [customers, orders, events, users] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.order.count({ where: { organizationId } }),
    prisma.event.count({ where: { organizationId } }),
    prisma.member.count({ where: { organizationId } }),
  ]);
  return { customers, orders, events, users };
}

const MAX_PAGE = 100;

export async function listBusinessSummaries(opts: { cursor?: string; take?: number }) {
  const take = Math.min(Math.max(opts.take ?? 50, 1), MAX_PAGE);
  const rows = await prisma.organization.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { businessId: opts.cursor }, skip: 1 } : {}),
    select: { businessId: true, name: true, status: true, createdAt: true, ownerFirstName: true, ownerLastName: true, contactEmail: true },
  });
  const page = rows.slice(0, take);
  return {
    items: page.map((o) => ({
      businessId: o.businessId,
      name: o.name,
      status: o.status,
      ownerName: [o.ownerFirstName, o.ownerLastName].filter(Boolean).join(" ") || null,
      ownerEmail: o.contactEmail,
      createdAt: o.createdAt.toISOString(),
    })),
    nextCursor: rows.length > take ? page[page.length - 1].businessId : null,
  };
}

export async function getBusinessSummary(businessId: string) {
  const org = await prisma.organization.findUnique({ where: { businessId }, select: { id: true, businessId: true, name: true, status: true, createdAt: true, ownerFirstName: true, ownerLastName: true, contactEmail: true } });
  if (!org) return null;
  const snapshot = await prisma.opsSnapshot.findUnique({ where: { businessId } });
  return {
    businessId: org.businessId,
    name: org.name,
    status: org.status,
    ownerName: [org.ownerFirstName, org.ownerLastName].filter(Boolean).join(" ") || null,
    ownerEmail: org.contactEmail,
    createdAt: org.createdAt.toISOString(),
    counts: await usageCounts(org.id),
    snapshot: snapshot ? { version: snapshot.version, status: (snapshot.data as { status?: string }).status ?? null, receivedAt: snapshot.receivedAt.toISOString() } : null,
  };
}
