import { sendToBilling } from "@/lib/billing-door";

/** No page of its own: see `sendToBilling`. */
export default async function SubscriptionRedirectPage() {
  return sendToBilling();
}
