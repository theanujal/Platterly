/**
 * Chunk 25 — the events a kitchen can subscribe a webhook to. Only events that correspond to something the app really
 * does; each is posted when it happens. Safe for the browser (the Settings page lists these).
 */
export const WEBHOOK_EVENTS = [
  { id: "order.created", label: "Order created", description: "A new order was placed (by your team, the public link or the API)." },
  { id: "order.updated", label: "Order updated", description: "An order's details were changed." },
  { id: "order.status_changed", label: "Order status changed", description: "An order moved to another status. Carries the previous status." },
  { id: "customer.created", label: "Customer created", description: "A new customer or lead was added." },
  { id: "customer.updated", label: "Customer updated", description: "A customer's details were changed." },
  { id: "event.created", label: "Event created", description: "An event was created (usually from an order)." },
  { id: "event.updated", label: "Event updated", description: "An event's details, location or status changed." },
  { id: "payment.created", label: "Payment created", description: "A payment was recorded, or a customer started one." },
  { id: "payment.updated", label: "Payment updated", description: "A payment was confirmed." },
  { id: "payment.failed", label: "Payment failed", description: "A payment failed or was rejected." },
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number]["id"];

export const WEBHOOK_EVENT_IDS: readonly string[] = WEBHOOK_EVENTS.map((e) => e.id);

export function cleanEvents(values: unknown): WebhookEventName[] {
  const wanted = new Set(Array.isArray(values) ? values : []);
  return WEBHOOK_EVENTS.map((e) => e.id).filter((id) => wanted.has(id));
}
