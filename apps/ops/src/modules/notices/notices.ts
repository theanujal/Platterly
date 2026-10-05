import "server-only";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { NOTICE_LIMITS } from "./limits";
import { enqueueCommand, runDueCommands } from "@/modules/commands/outbox";

/**
 * The sidebar notice (docs/ops-contract.md 6, `notice.set`). One per product; saving it queues the same notice for every
 * business of that product, and the scheduled job queues it again for businesses that joined afterwards. A command's
 * dedupe key holds the notice's version (its updatedAt), so queuing twice never sends twice.
 */
export class NoticeError extends Error {}

export interface NoticeInput {
  enabled: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  buttonUrl: string;
}

const LABELS = { title: "Title", message: "Message", buttonLabel: "Button label", buttonUrl: "Button link" } as const;

export function cleanNotice(input: NoticeInput) {
  const value = { title: input.title.trim(), message: input.message.trim(), buttonLabel: input.buttonLabel.trim(), buttonUrl: input.buttonUrl.trim() };
  for (const key of Object.keys(NOTICE_LIMITS) as (keyof typeof NOTICE_LIMITS)[]) {
    if (value[key].length > NOTICE_LIMITS[key]) throw new NoticeError(`${LABELS[key]} can be at most ${NOTICE_LIMITS[key]} characters.`);
  }
  if (input.enabled && !value.title && !value.message) throw new NoticeError("Add a title or a message before switching the notice on.");
  if (value.buttonLabel && !value.buttonUrl) throw new NoticeError("Add a link for the button, or clear its label.");
  if (value.buttonUrl && !value.buttonLabel) throw new NoticeError("Add a label for the button, or clear its link.");
  // A button opens a page inside the product ("/subscribe") or a secure outside address, never anything else.
  if (value.buttonUrl && !/^(\/(?!\/)|https:\/\/)/.test(value.buttonUrl)) throw new NoticeError("The button link must start with / (a page in the product) or https://.");
  const blank = (text: string) => text || null;
  return { enabled: input.enabled, title: blank(value.title), message: blank(value.message), buttonLabel: blank(value.buttonLabel), buttonUrl: blank(value.buttonUrl) };
}

export async function getNotice(productKey: string) {
  return prisma.productNotice.findUnique({ where: { productKey } });
}

/** Queues the product's current notice for every business of the product. Returns how many commands were newly queued. */
export async function queueNotice(productKey: string): Promise<number> {
  const notice = await prisma.productNotice.findUnique({ where: { productKey } });
  if (!notice) return 0;
  const businesses = await prisma.businessProduct.findMany({ where: { productKey, business: { status: { not: "PENDING_DELETE" } } }, select: { businessId: true } });
  let queued = 0;
  for (const { businessId } of businesses) {
    const id = await enqueueCommand({
      productKey,
      dedupeKey: `notice:${productKey}:${businessId}:${notice.updatedAt.getTime()}`,
      command: { type: "notice.set", businessId, payload: { enabled: notice.enabled, title: notice.title, message: notice.message, buttonLabel: notice.buttonLabel, buttonUrl: notice.buttonUrl } },
    });
    if (id) queued += 1;
  }
  return queued;
}

/** Saves the notice for a product, queues it for every business and makes a first attempt at once. */
export async function publishNotice(productKey: string, input: NoticeInput, staffId: string | null): Promise<{ businesses: number; queued: number }> {
  const product = await prisma.product.findUnique({ where: { key: productKey } });
  if (!product) throw new NoticeError("Unknown product.");
  const data = cleanNotice(input);
  await prisma.productNotice.upsert({ where: { productKey }, create: { productKey, ...data, updatedBy: staffId }, update: { ...data, updatedBy: staffId } });
  const queued = await queueNotice(productKey);
  await audit({ actorUserId: staffId, action: "notice.published", subject: productKey, detail: { enabled: data.enabled, title: data.title, businesses: queued } });
  await runDueCommands(new Date(), 200, productKey).catch(() => undefined);
  return { businesses: await prisma.businessProduct.count({ where: { productKey } }), queued };
}

/** The scheduled catch-up: any product with a notice queues it again, which only adds commands for businesses that have none yet. */
export async function syncNotices(productKey?: string): Promise<number> {
  let queued = 0;
  for (const row of await prisma.productNotice.findMany({ where: productKey ? { productKey } : {}, select: { productKey: true } })) queued += await queueNotice(row.productKey);
  return queued;
}

/** How the current notice fared across the product's businesses, for the screen. */
export async function noticeDelivery(productKey: string) {
  const notice = await getNotice(productKey);
  if (!notice) return null;
  const rows = await prisma.outboundCommand.groupBy({ by: ["status"], where: { productKey, type: "notice.set", dedupeKey: { endsWith: `:${notice.updatedAt.getTime()}` } }, _count: true });
  const count = (status: string) => rows.find((r) => r.status === status)?._count ?? 0;
  return { sent: count("SENT"), pending: count("PENDING"), failed: count("FAILED") };
}
