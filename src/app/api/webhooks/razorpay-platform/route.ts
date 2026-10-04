import { confirmSubscriptionPayment, failSubscriptionPayment, platformRazorpay } from "@/modules/subscriptions/billing";
import { verifyWebhookSignature } from "@/modules/payments/razorpay";

/**
 * Razorpay's webhook for PLATTERLY's own account (Chunk 20): kitchens paying for their plan. Signed with
 * RAZORPAY_WEBHOOK_SECRET. Every failure (not set up, no signature, bad signature) answers the same 401. A valid
 * event is answered 200 even when it matches nothing, so Razorpay stops retrying. Kitchen-to-customer payments use
 * the per-kitchen route next to this one.
 */
export async function POST(request: Request) {
  const secret = platformRazorpay()?.webhookSecret;
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();
  if (!secret || !signature || !verifyWebhookSignature(rawBody, signature, secret)) return new Response("Unauthorized", { status: 401 });

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("OK");
  }
  const entity = event.payload?.payment?.entity;
  if (entity?.id && entity.order_id) {
    if (event.event === "payment.captured") await confirmSubscriptionPayment(entity.order_id, entity.id);
    else if (event.event === "payment.failed") await failSubscriptionPayment(entity.order_id);
  }
  return new Response("OK");
}
