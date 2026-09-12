import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export interface AuditParams {
  organizationId: string;
  /** Nullable because the actor may later be removed (SetNull on the FK). */
  actorUserId?: string;
  action: string;
  recordType: string;
  recordId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/**
 * Chunk 2 Group 2.2 — called incrementally by every module chunk from
 * Chunk 9 onward as each mutates its own records. Viewer UI is Chunk 17.
 */
export async function audit(params: AuditParams) {
  return prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: params.action,
      recordType: params.recordType,
      recordId: params.recordId,
      before: params.before,
      after: params.after,
    },
  });
}
