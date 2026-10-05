import { confirmPayment, failPayment } from "@/modules/billing/billing";
import { platformRazorpay, verifyWebhookSignature } from "@/modules/billing/razorpay";

/**
 * Razorpay's webhook for PLATTERLY's own account: businesses paying for their plan. Signed with RAZORPAY_WEBHOOK_SECRET.
 * Every failure (not set up, no signature, bad signature) answers the same 401. A valid event is answered 200 even when it
 * matches nothing, so Razorpay stops retrying. (A kitchen's own payments from its customers use the kitchen's own account
 * and webhook in the product, never this one.)
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = platformRazorpay()?.webhookSecret;
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();
  if (!secret || !signature || !verifyWebhookSignature(rawBody, signature, secret)) return new Response("Unauthorized", { status: 401 });

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("OK");
  }
  const entity = event.payload?.payment?.entity;
  if (entity?.id && entity.order_id) {
    if (event.event === "payment.captured") await confirmPayment(entity.order_id, entity.id, new Date(), typeof entity.amount === "number" ? entity.amount : undefined);
    else if (event.event === "payment.failed") await failPayment(entity.order_id);
  }
  return new Response("OK");
}
