import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { renderEmail } from "@/modules/messages/layout";
import { sendEmail } from "@/modules/messages/zeptomail";

/**
 * What staff are told (replaces Alerts). Anything that happens to a business or product that someone should know about writes
 * one row here: the bell, the Notifications page and the Overview's "Needs attention" read them. A warning or a critical one is
 * also emailed to STAFF_NOTIFY_EMAILS (comma separated) when set and ZeptoMail is configured; mail trouble never loses the row.
 */
export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface NotifyInput {
  productKey?: string | null;
  businessId?: string | null;
  kind: string;
  severity?: Severity;
  title: string;
  body: string;
  link?: string | null;
  /** One notification per fact: a repeat with the same key adds nothing. */
  dedupeKey?: string;
}

type Db = Pick<PrismaClient, "notification"> | Prisma.TransactionClient;

/** Writes the notification (inside the caller's transaction when given one). Returns false when the dedupe key already existed. */
export async function notify(input: NotifyInput, db: Db = prisma): Promise<boolean> {
  const data = {
    productKey: input.productKey ?? null, businessId: input.businessId ?? null, kind: input.kind, severity: input.severity ?? "INFO",
    title: input.title.slice(0, 160), body: input.body.slice(0, 600), link: input.link ?? null, dedupeKey: input.dedupeKey ?? null,
  };
  if (input.dedupeKey) {
    const made = await db.notification.createMany({ data: [data], skipDuplicates: true });
    return made.count > 0;
  }
  await db.notification.create({ data });
  return true;
}

/** Best effort: a notification failing to write or to email must never undo the thing it reports. */
export async function notifySafely(input: NotifyInput): Promise<void> {
  try {
    const created = await notify(input);
    if (created && input.severity && input.severity !== "INFO") await emailStaff(input);
  } catch (error) {
    console.error("[ops notifications] could not notify", input.kind, error);
  }
}

export async function emailStaff(input: Pick<NotifyInput, "title" | "body" | "link" | "severity">): Promise<void> {
  const to = (process.env.STAFF_NOTIFY_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (to.length === 0) return;
  const html = renderEmail({ tag: "Ops", eyebrow: input.severity === "CRITICAL" ? "Needs attention now" : "Needs attention", title: input.title, greeting: "", bodyHtml: `<p>${input.body.replace(/[<>&]/g, "")}</p>` });
  for (const address of to) await sendEmail({ to: address, subject: `Platterly Ops: ${input.title}`, html }).catch(() => undefined);
}

const scope = (productKey?: string | null): Prisma.NotificationWhereInput => (productKey ? { productKey } : {});

export async function listNotifications(opts: { productKey?: string | null; unreadOnly?: boolean; severity?: Severity; take?: number } = {}) {
  return prisma.notification.findMany({
    where: { ...scope(opts.productKey), ...(opts.unreadOnly ? { readAt: null } : {}), ...(opts.severity ? { severity: opts.severity } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    include: { product: { select: { name: true } }, business: { select: { id: true, name: true } } },
  });
}

export async function countUnread(productKey?: string | null): Promise<number> {
  return prisma.notification.count({ where: { readAt: null, ...scope(productKey) } });
}

export async function markRead(id: string, actorUserId: string | null): Promise<void> {
  await prisma.notification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
  await audit({ actorUserId, action: "notification.read", subject: id });
}

export async function markAllRead(actorUserId: string | null, productKey?: string | null): Promise<number> {
  const done = await prisma.notification.updateMany({ where: { readAt: null, ...scope(productKey) }, data: { readAt: new Date() } });
  await audit({ actorUserId, action: "notification.read_all", subject: productKey ?? "all", detail: { count: done.count } });
  return done.count;
}
