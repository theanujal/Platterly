import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Every change an operator makes is written here (who, what, to what). Never throws into the caller's flow. */
export async function audit(entry: { actorUserId: string | null; action: string; subject?: string; detail?: Prisma.InputJsonValue }): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorUserId: entry.actorUserId, action: entry.action, subject: entry.subject ?? null, detail: entry.detail } });
  } catch (error) {
    console.error("[ops audit] could not write", entry.action, error);
  }
}
