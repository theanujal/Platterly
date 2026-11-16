// Razorpay Checkout in the browser: the one script Razorpay publishes for it, loaded only when someone is about to pay. The order, the amount and the key come
// from Ops (through /api/store/checkout); this file only opens the window and hands back what Razorpay returns, for Ops to check.
export type RazorpayOrder = { keyId: string; razorpayOrderId: string; amountPaise: number; businessName: string; description: string };
export type RazorpaySubscription = { keyId: string; razorpaySubscriptionId: string; amountPaise: number; businessName: string; description: string; /** Offer this one method only ("Add UPI"). */ onlyMethod?: "upi" };
/** A card registration: the Rs 5 order for the business's Razorpay customer, opened with the recurring flag so the card is saved for renewals. */
export type RazorpayCardRegistration = { keyId: string; razorpayOrderId: string; customerId: string; amountPaise: number; description: string };
export type RazorpayReturn = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
export type RazorpaySubscriptionReturn = { razorpay_subscription_id: string; razorpay_payment_id: string; razorpay_signature: string };
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

type Opened<T> = { resolve: (value: T | null) => void };

/** Opens Razorpay Checkout with these options. Resolves with Razorpay's answer when the person finishes, and with null when they close the window first. */
async function open<T>(options: Record<string, unknown>): Promise<T | null> {
  await loadScript();
  const Razorpay = (window as unknown as RazorpayWindow).Razorpay!;
  return new Promise((resolve: Opened<T>["resolve"]) => {
    const checkout = new Razorpay({ ...options, currency: "INR", handler: (response: T) => resolve(response), modal: { ondismiss: () => resolve(null) } });
    checkout.on("payment.failed", () => {
      /* the window stays open so the person can try another method; nothing to do here */
    });
    checkout.open();
  });
}

/** A one-time payment (yearly plans). Resolves with Razorpay's answer when the person pays, and with null when they close the window without paying. */
export const openRazorpay = (order: RazorpayOrder, prefill: { name: string }) =>
  open<RazorpayReturn>({ key: order.keyId, order_id: order.razorpayOrderId, amount: order.amountPaise, name: order.businessName, description: order.description, prefill: { name: prefill.name } });

/** An auto-pay (monthly plans, or a new primary method): the person authorises the mandate; Razorpay charges every 30 days from then. */
export const openRazorpaySubscription = (sub: RazorpaySubscription, prefill: { name: string }) =>
  open<RazorpaySubscriptionReturn>({ key: sub.keyId, subscription_id: sub.razorpaySubscriptionId, name: sub.businessName, description: sub.description, prefill: { name: prefill.name }, ...(sub.onlyMethod === "upi" ? { method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false } } : {}) });

/** Saves a card for renewals: the Rs 5 registration order of the business's Razorpay customer, opened with the recurring flag. */
export const openRazorpayCardRegistration = (reg: RazorpayCardRegistration, prefill: { name: string }) =>
  open<RazorpayReturn>({ key: reg.keyId, order_id: reg.razorpayOrderId, customer_id: reg.customerId, recurring: "1", amount: reg.amountPaise, name: "Platterly", description: reg.description, prefill: { name: prefill.name } });
