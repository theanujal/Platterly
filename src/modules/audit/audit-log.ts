import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { describeAction, describeActor, diffAudit, recordHref, type AuditChange } from "./audit-text";

/**
 * Chunk 17.2 — the Audit Log page's data. Every row is scoped to the kitchen asking; filters are applied in the
 * database and the list is paged, so a busy kitchen's years of history never load at once.
 */
export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilter {
  search?: string;
  recordType?: string;
  actorId?: string;
  from?: Date | null;
  to?: Date | null;
  page?: number;
}

export interface AuditEntry {
  id: string;
  createdAt: Date;
  who: string;
  summary: string;
  action: string;
  recordType: string;
  recordId: string;
  href: string | null;
  changes: AuditChange[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function where(organizationId: string, f: AuditFilter): Prisma.AuditLogWhereInput {
  const search = f.search?.trim();
  return {
    organizationId,
    ...(f.recordType ? { recordType: f.recordType } : {}),
    ...(f.actorId ? { actorUserId: f.actorId === "none" ? null : f.actorId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: new Date(f.to.getTime() + DAY_MS) } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: "insensitive" } },
            { recordType: { contains: search, mode: "insensitive" } },
            { recordId: { equals: search } },
            { actorUser: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listAuditLog(organizationId: string, filter: AuditFilter = {}) {
  const clause = where(organizationId, filter);
  const total = await prisma.auditLog.count({ where: clause });
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filter.page ?? 1) || 1), pages);

  const [rows, recordTypes, actorRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: clause,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { actorUser: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({ where: { organizationId }, distinct: ["recordType"], select: { recordType: true }, orderBy: { recordType: "asc" } }),
    prisma.auditLog.findMany({ where: { organizationId, actorUserId: { not: null } }, distinct: ["actorUserId"], select: { actorUserId: true, actorUser: { select: { name: true } } } }),
  ]);

  const entries: AuditEntry[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    who: describeActor(r.actorUser?.name, r.action),
    summary: describeAction(r.action),
    action: r.action,
    recordType: r.recordType,
    recordId: r.recordId,
    href: recordHref(r.recordType, r.recordId),
    changes: diffAudit(r.before, r.after),
  }));

  return {
    entries,
    total,
    page,
    pages,
    from: total === 0 ? 0 : (page - 1) * AUDIT_PAGE_SIZE + 1,
    to: Math.min(page * AUDIT_PAGE_SIZE, total),
    recordTypes: recordTypes.map((r) => r.recordType),
    actors: actorRows.filter((a) => a.actorUserId).map((a) => ({ id: a.actorUserId as string, name: a.actorUser?.name ?? "Former team member" })),
  };
}
