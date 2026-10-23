import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * The payment log: every signed Razorpay webhook to Platterly's own account and every failed-setup report from a product,
 * kept for good so a payment question can be answered from Ops without searching Razorpay's dashboard.
 */
export type RazorpayWebhook = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string; error_description?: string | null } };
    subscription?: { entity?: { id?: string; status?: string } };
  };
};

/** Stores an event (once per Razorpay event id: a retry finds the row it stored before). */
export async function recordRazorpayEvent(input: { eventId?: string | null; source: "webhook" | "product"; type: string; payload: object; businessId?: string | null; razorpaySubscriptionId?: string | null; razorpayPaymentId?: string | null; razorpayOrderId?: string | null; processedAt?: Date | null; error?: string | null }) {
  const data = { ...input, id: `rze_${randomBytes(16).toString("hex")}`, eventId: input.eventId ?? null, payload: input.payload as Prisma.InputJsonValue };
  if (!data.eventId) return prisma.razorpayEvent.create({ data });
  return prisma.razorpayEvent.upsert({ where: { eventId: data.eventId }, create: data, update: {} });
}

/** A webhook's ids, as the log keeps them. */
export function webhookIds(event: RazorpayWebhook) {
  const payment = event.payload?.payment?.entity;
  return { razorpaySubscriptionId: event.payload?.subscription?.entity?.id ?? null, razorpayPaymentId: payment?.id ?? null, razorpayOrderId: payment?.order_id ?? null };
}

/** Marks an event applied (or not, with the error), and names the business whose plan or stand payment it matched. */
export async function finishRazorpayEvent(id: string, error?: string) {
  const row = await prisma.razorpayEvent.findUniqueOrThrow({ where: { id } });
  const ids = [
    row.razorpaySubscriptionId && { razorpaySubscriptionId: row.razorpaySubscriptionId },
    row.razorpayPaymentId && { razorpayPaymentId: row.razorpayPaymentId },
    row.razorpayOrderId && { razorpayOrderId: row.razorpayOrderId },
  ].filter((w) => !!w);
  const match = row.businessId || ids.length === 0 ? null
    : (await prisma.subscriptionPayment.findFirst({ where: { OR: ids }, select: { businessId: true } })) ?? (row.razorpayOrderId ? await prisma.standOrder.findUnique({ where: { razorpayOrderId: row.razorpayOrderId }, select: { businessId: true } }) : null);
  return prisma.razorpayEvent.update({ where: { id }, data: { processedAt: error ? null : new Date(), error: error ?? null, ...(match ? { businessId: match.businessId } : {}) } });
}

/** Newest first. */
export function listRazorpayEvents(where: Prisma.RazorpayEventWhereInput, take?: number) {
  return prisma.razorpayEvent.findMany({ where, orderBy: { receivedAt: "desc" }, take });
}

/** One log row as Ops shows it: the amount (rupees), Razorpay's status and the reason, read from the stored payload. */
export function describeRazorpayEvent(row: { source: string; payload: unknown; error: string | null; processedAt: Date | null }) {
  if (row.source === "product") {
    const report = row.payload as { reason?: string; detail?: string | null };
    return { amount: null, status: report.reason === "declined" ? "declined" : "not finished", reason: report.detail ?? null };
  }
  const event = row.payload as RazorpayWebhook;
  const payment = event.payload?.payment?.entity;
  return {
    amount: typeof payment?.amount === "number" ? payment.amount / 100 : null,
    status: row.error ? "not applied" : (payment?.status ?? event.payload?.subscription?.entity?.status ?? null),
    reason: row.error ?? payment?.error_description ?? null,
  };
}
