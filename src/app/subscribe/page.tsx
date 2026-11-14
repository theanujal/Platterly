import { sendToBilling } from "@/lib/billing-door";

export const metadata = { robots: { index: false, follow: false } };

/** No page of its own: see `sendToBilling`. */
export default async function SubscribePage() {
  return sendToBilling();
}
