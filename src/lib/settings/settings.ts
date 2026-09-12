import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Chunk 2 Group 2.5 — generic tenant-settings key/value store. Chunk 5
 * populates it with real fields (business profile, currency preferences,
 * notification toggles, etc.) — this scaffold has no opinion on what keys
 * exist.
 */
export async function getSetting<T = unknown>(organizationId: string, key: string): Promise<T | null> {
  const row = await prisma.tenantSetting.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  return (row?.value as T) ?? null;
}

export async function setSetting(
  organizationId: string,
  key: string,
  value: Prisma.InputJsonValue,
) {
  return prisma.tenantSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value },
    update: { value },
  });
}
