import { autoPayEvent, confirmPayment, failPayment } from "@/modules/billing/billing";
import { finishRazorpayEvent, recordRazorpayEvent, webhookIds, type RazorpayWebhook } from "@/modules/billing/events";
import { confirmStandPayment, failStandPayment } from "@/modules/stand/stand";
import { platformRazorpay, verifyWebhookSignature, type RazorpaySubscription } from "@/modules/billing/razorpay";
import { notifySafely } from "@/modules/notifications/notifications";

/**
 * Razorpay's webhook for PLATTERLY's own account: businesses paying for their plan. Signed with RAZORPAY_WEBHOOK_SECRET.
 * Every failure (not set up, no signature, bad signature) answers the same 401. A valid event is answered 200 even when it
 * matches nothing, so Razorpay stops retrying. (A kitchen's own payments from its customers use the kitchen's own account
 * and webhook in the product, never this one.) Monthly auto-pay arrives as `subscription.*` events (a charge, a failed charge,
 * Razorpay giving up, pause and resume). Every signed event is kept in the payment log before it is applied; one that could
 * not be applied answers 500, so Razorpay sends it again.
 */
export const dynamic = "force-dynamic";

type Event = RazorpayWebhook & { payload?: { subscription?: { entity?: RazorpaySubscription } } };

export async function POST(request: Request) {
  const secret = platformRazorpay()?.webhookSecret;
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();
  if (!secret || !signature || !verifyWebhookSignature(rawBody, signature, secret)) return new Response("Unauthorized", { status: 401 });

  let event: Event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("OK");
  }
  const row = await recordRazorpayEvent({ eventId: request.headers.get("x-razorpay-event-id"), source: "webhook", type: event.event ?? "unknown", payload: event, ...webhookIds(event) });
  if (row.processedAt) return new Response("OK");
  try {
    await apply(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await finishRazorpayEvent(row.id, message);
    await notifySafely({ businessId: failed.businessId, kind: "razorpay.event_failed", severity: "CRITICAL", title: "A Razorpay event could not be applied", body: `${row.type}: ${message}. Razorpay will send it again.`, link: failed.businessId ? `/businesses/${failed.businessId}?tab=subscription` : null, dedupeKey: `razorpay_event_failed:${row.id}` });
    return new Response("Not applied", { status: 500 });
  }
  await finishRazorpayEvent(row.id);
  return new Response("OK");
}

async function apply(event: Event) {
  // Auto-pay: Razorpay also sends payment.captured for each charge, but its order is Razorpay's own and matches none of ours below.
  const subscription = event.payload?.subscription?.entity;
  if (event.event?.startsWith("subscription.") && subscription?.id) return autoPayEvent(event.event, subscription, event.payload?.payment?.entity);
  const entity = event.payload?.payment?.entity;
  if (!entity?.id || !entity.order_id) return;
  const captured = typeof entity.amount === "number" ? entity.amount : undefined;
  // An Order QR stand has its own orders; a plan payment has its own. The Razorpay order id says which.
  if (event.event === "payment.captured") {
    if (!(await confirmStandPayment(entity.order_id, entity.id, new Date(), captured))) await confirmPayment(entity.order_id, entity.id, new Date(), captured);
  } else if (event.event === "payment.failed") {
    if (!(await failStandPayment(entity.order_id))) await failPayment(entity.order_id);
  }
}
