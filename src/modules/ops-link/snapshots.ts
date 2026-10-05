import "server-only";
import { isNewerSnapshot, type EntitlementSnapshot } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Stores a snapshot for a kitchen. Only a higher version replaces the stored one (a late or repeated push changes nothing). */
export async function storeSnapshot(organizationId: string, snapshot: EntitlementSnapshot): Promise<{ applied: boolean; version: number | null }> {
  const current = await prisma.opsSnapshot.findUnique({ where: { businessId: snapshot.businessId } });
  if (!isNewerSnapshot(snapshot, current ? { version: current.version } : null)) return { applied: false, version: current?.version ?? null };
  const data = snapshot as unknown as Prisma.InputJsonValue;
  await prisma.opsSnapshot.upsert({
    where: { businessId: snapshot.businessId },
    create: { businessId: snapshot.businessId, organizationId, version: snapshot.version, data },
    update: { organizationId, version: snapshot.version, data, receivedAt: new Date() },
  });
  return { applied: true, version: snapshot.version };
}
