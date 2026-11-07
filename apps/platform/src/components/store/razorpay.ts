// Razorpay Checkout in the browser: the one script Razorpay publishes for it, loaded only when someone is about to pay. The order, the amount and the key come
// from Ops (through /api/store/checkout); this file only opens the window and hands back what Razorpay returns, for Ops to check.
export type RazorpayOrder = { keyId: string; razorpayOrderId: string; amountPaise: number; businessName: string; description: string };
export type RazorpayReturn = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayWindow = { Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, handler: (response: unknown) => void): void } };

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<void> {
  if ((window as unknown as RazorpayWindow).Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay could not be loaded."));
    document.head.appendChild(script);
  });
}

/** Opens Razorpay Checkout. Resolves with Razorpay's answer when the person pays, and with null when they close the window without paying. */
export async function openRazorpay(order: RazorpayOrder, prefill: { name: string }): Promise<RazorpayReturn | null> {
  await loadScript();
  const Razorpay = (window as unknown as RazorpayWindow).Razorpay!;
  return new Promise((resolve) => {
    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountPaise,
      currency: "INR",
      name: order.businessName,
      description: order.description,
      prefill: { name: prefill.name },
      handler: (response: RazorpayReturn) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.on("payment.failed", () => {
      /* the window stays open so the person can try another method; nothing to do here */
    });
    checkout.open();
  });
}
