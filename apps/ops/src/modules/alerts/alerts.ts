import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function listAlerts(opts: { includeAcknowledged?: boolean; take?: number } = {}) {
  return prisma.alert.findMany({
    where: opts.includeAcknowledged ? {} : { acknowledgedAt: null },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    include: { product: { select: { name: true } }, business: { select: { id: true, name: true } } },
  });
}

export async function acknowledgeAlert(id: string, actorUserId: string | null): Promise<void> {
  await prisma.alert.updateMany({ where: { id, acknowledgedAt: null }, data: { acknowledgedAt: new Date() } });
  await audit({ actorUserId, action: "alert.acknowledged", subject: id });
}

export async function countOpenAlerts(): Promise<number> {
  return prisma.alert.count({ where: { acknowledgedAt: null } });
}
