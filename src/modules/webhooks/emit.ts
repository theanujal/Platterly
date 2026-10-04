import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { attemptDelivery, newEventId } from "./deliver";
import type { WebhookEventName } from "./events";

/**
 * Chunk 25 — turns something that happened in the app into queued webhooks. A call site is one line
 * (`await emitOrder(organizationId, "order.created", orderId)`); this file decides who is subscribed, builds a small
 * payload (ids, names, status and amounts — the receiver fetches anything more through the API, so no phone numbers,
 * emails, notes or payment details leave in a webhook), stores a delivery per endpoint and starts sending. It never
 * throws into the business code that called it: a webhook problem must never fail an order or a payment.
 */
const day = (d: Date) => d.toISOString().slice(0, 10);

async function subscribers(organizationId: string, event: WebhookEventName) {
  return prisma.webhookEndpoint.findMany({ where: { organizationId, isActive: true, events: { has: event } }, select: { id: true } });
}

/** Queues the event for every subscribed endpoint of the kitchen and kicks off the first send without waiting for it. */
export async function enqueue(organizationId: string, event: string, endpointIds: string[], data: Prisma.InputJsonValue): Promise<string[]> {
  if (endpointIds.length === 0) return [];
  const eventId = newEventId();
  const ids: string[] = [];
  for (const endpointId of endpointIds) {
    const row = await prisma.webhookDelivery.create({ data: { organizationId, endpointId, eventId, eventName: event, payload: data, nextAttemptAt: new Date() }, select: { id: true } });
    ids.push(row.id);
  }
  // First attempt in the background: the caller's request does not wait on someone else's server.
  void Promise.allSettled(ids.map((id) => attemptDelivery(id))).catch(() => undefined);
  return ids;
}

async function emit(organizationId: string, event: WebhookEventName, build: () => Promise<Prisma.InputJsonValue | null>) {
  try {
    const endpoints = await subscribers(organizationId, event);
    if (endpoints.length === 0) return;
    const data = await build();
    if (data) await enqueue(organizationId, event, endpoints.map((e) => e.id), data);
  } catch (error) {
    console.error("[webhooks] could not queue", event, (error as Error)?.name);
  }
}

export const emitOrder = (organizationId: string, event: "order.created" | "order.updated" | "order.status_changed", orderId: string, previousStatus?: string) =>
  emit(organizationId, event, async () => {
    const o = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { id: true, orderNumber: true, status: true, customerId: true, eventStartDate: true, eventEndDate: true, total: true, balance: true, paymentStatus: true } });
    if (!o) return null;
    return {
      order: { id: o.id, order_number: o.orderNumber, status: o.status, customer_id: o.customerId, event_start_date: day(o.eventStartDate), event_end_date: day(o.eventEndDate), total: Number(o.total), balance: Number(o.balance), payment_status: o.paymentStatus },
      ...(event === "order.status_changed" ? { previous_status: previousStatus ?? null } : {}),
    };
  });

export const emitCustomer = (organizationId: string, event: "customer.created" | "customer.updated", customerId: string) =>
  emit(organizationId, event, async () => {
    const c = await prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true, name: true, isActive: true, isEnquiry: true } });
    return c ? { customer: { id: c.id, name: c.name, is_active: c.isActive, is_enquiry: c.isEnquiry } } : null;
  });

/** One webhook per event, each with its own event id. */
export async function emitEvents(organizationId: string, event: "event.created" | "event.updated", eventIds: string[]) {
  for (const id of eventIds) {
    await emit(organizationId, event, async () => {
      const e = await prisma.event.findFirst({ where: { id, organizationId }, select: { id: true, name: true, status: true, orderId: true, customerId: true, startDate: true, endDate: true, assignedKitchenId: true } });
      return e ? { event: { id: e.id, name: e.name, status: e.status, order_id: e.orderId, customer_id: e.customerId, start_date: day(e.startDate), end_date: day(e.endDate), location_id: e.assignedKitchenId } } : null;
    });
  }
}

export const emitPayment = (organizationId: string, event: "payment.created" | "payment.updated" | "payment.failed", paymentId: string) =>
  emit(organizationId, event, async () => {
    const p = await prisma.payment.findFirst({ where: { id: paymentId, organizationId }, select: { id: true, orderId: true, invoiceId: true, amount: true, type: true, method: true, status: true, source: true } });
    return p ? { payment: { id: p.id, order_id: p.orderId, invoice_id: p.invoiceId, amount: Number(p.amount), type: p.type, method: p.method, status: p.status, source: p.source } } : null;
  });
