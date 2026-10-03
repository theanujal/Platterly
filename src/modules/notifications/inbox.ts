import "server-only";
import { prisma } from "@/lib/db";

/**
 * Chunk 16 Group 16.5: the bell's data. A person sees only the in-app notifications written for them
 * (`notifyTeam` writes one row per person), never a colleague's, and never another kitchen's. A Super Admin has no
 * kitchen: pass `null` as the organization and they see their own platform alerts across all kitchens.
 */

export interface InboxItem {
  id: string;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: Date;
}

const INBOX_SIZE = 20;

function toItem(row: { id: string; payload: unknown; readAt: Date | null; createdAt: Date }): InboxItem {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const orderId = typeof payload.orderId === "string" ? payload.orderId : null;
  const href = typeof payload.href === "string" ? payload.href : null;
  return {
    id: row.id,
    title: typeof payload.title === "string" ? payload.title : "Notification",
    message: typeof payload.message === "string" ? payload.message : "",
    href: href ?? (orderId ? `/orders/${orderId}` : null),
    read: row.readAt !== null,
    createdAt: row.createdAt,
  };
}

const mine = (organizationId: string | null, userId: string) => ({ ...(organizationId ? { organizationId } : {}), recipientUserId: userId, channel: "IN_APP" as const });

export async function getInbox(organizationId: string | null, userId: string): Promise<{ items: InboxItem[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: mine(organizationId, userId), orderBy: { createdAt: "desc" }, take: INBOX_SIZE, select: { id: true, payload: true, readAt: true, createdAt: true } }),
    prisma.notification.count({ where: { ...mine(organizationId, userId), readAt: null } }),
  ]);
  return { items: rows.map(toItem), unread };
}

export async function markRead(organizationId: string | null, userId: string, id: string) {
  await prisma.notification.updateMany({ where: { ...mine(organizationId, userId), id, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(organizationId: string | null, userId: string) {
  await prisma.notification.updateMany({ where: { ...mine(organizationId, userId), readAt: null }, data: { readAt: new Date() } });
}
