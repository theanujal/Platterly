import { confirmRazorpayPayment, failRazorpayPayment } from "@/modules/payments/checkout";
import { getRazorpayCredentials } from "@/modules/payments/payment-settings";
import { verifyWebhookSignature } from "@/modules/payments/razorpay";

/**
 * Razorpay's webhook for ONE kitchen, signed with that kitchen's own webhook secret. Every failure
 * (unknown kitchen, no keys saved, bad signature) answers the same 401, so nothing can be probed.
 * A valid event is answered 200 even when it matches no payment, so Razorpay stops retrying.
 */
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();

  const creds = await getRazorpayCredentials(organizationId).catch(() => null);
  if (!creds || !signature || !verifyWebhookSignature(rawBody, signature, creds.webhookSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string; amount?: number } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("OK");
  }
  const entity = event.payload?.payment?.entity;
  if (entity?.id && entity.order_id) {
    if (event.event === "payment.captured") await confirmRazorpayPayment(organizationId, entity.order_id, entity.id, entity.method, typeof entity.amount === "number" ? entity.amount : undefined);
    else if (event.event === "payment.failed") await failRazorpayPayment(organizationId, entity.order_id);
  }
  return new Response("OK");
}
