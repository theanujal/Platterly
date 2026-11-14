import { describe, expect, it } from "vitest";
import { createRazorpayCustomer, createRazorpaySubscription, createTokenRegistrationOrder, deleteRazorpayToken, fetchCustomerTokens, fetchRazorpayPayment, refundRazorpayPayment, type PlatformRazorpay } from "../razorpay";

const creds: PlatformRazorpay = { keyId: "rzp_test_k", keySecret: "secret", webhookSecret: "w" };

/** A Razorpay stand-in that records the request and answers with the given JSON. */
function razorpay(answer: unknown, status = 200) {
  const seen: { method?: string; url?: string; body?: unknown; auth?: string }[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    seen.push({ method: init?.method, url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get("authorization") ?? undefined });
    return new Response(JSON.stringify(answer), { status });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe("Razorpay calls for saved payment methods", () => {
  it("creates the business's Razorpay customer, reusing one that already exists", async () => {
    const { fetchImpl, seen } = razorpay({ id: "cust_1" });
    expect(await createRazorpayCustomer(creds, { name: "Spice Route", email: "o@example.test", contact: "9845671203", businessId: "biz_1" }, fetchImpl)).toEqual({ id: "cust_1" });
    expect(seen[0]).toMatchObject({ method: "POST", url: "https://api.razorpay.com/v1/customers", body: { name: "Spice Route", email: "o@example.test", contact: "9845671203", fail_existing: "0", notes: { businessId: "biz_1" } } });
    expect(seen[0].auth).toMatch(/^Basic /);
  });

  it("creates a Rs 5 token-registration order for a card, with token terms and the customer", async () => {
    const { fetchImpl, seen } = razorpay({ id: "order_reg" });
    const now = new Date("2026-11-14T00:00:00Z");
    expect(await createTokenRegistrationOrder(creds, { customerId: "cust_1", receipt: "reg_1", notes: { businessId: "biz_1" }, now }, fetchImpl)).toEqual({ id: "order_reg" });
    expect(seen[0].url).toBe("https://api.razorpay.com/v1/orders");
    expect(seen[0].body).toMatchObject({ amount: 500, currency: "INR", receipt: "reg_1", customer_id: "cust_1", method: "card", token: { max_amount: 1_500_000, frequency: "as_presented" }, notes: { businessId: "biz_1" } });
    expect((seen[0].body as { token: { expire_at: number } }).token.expire_at).toBe(Math.floor(now.getTime() / 1000) + 365 * 86400);
  });

  it("a subscription can carry the customer and a future start, so a switch is not charged twice", async () => {
    const { fetchImpl, seen } = razorpay({ id: "sub_1", status: "created", current_start: null, current_end: null });
    await createRazorpaySubscription(creds, { razorpayPlanId: "plan_1", notes: { a: "b" }, customerId: "cust_1", startAt: 1_800_000_000 }, fetchImpl);
    expect(seen[0].body).toMatchObject({ plan_id: "plan_1", total_count: 120, customer_id: "cust_1", start_at: 1_800_000_000, notes: { a: "b" } });
    const plain = razorpay({ id: "sub_2", status: "created", current_start: null, current_end: null });
    await createRazorpaySubscription(creds, { razorpayPlanId: "plan_1", notes: {} }, plain.fetchImpl);
    expect(plain.seen[0].body).not.toHaveProperty("customer_id");
    expect(plain.seen[0].body).not.toHaveProperty("start_at");
  });

  it("reads a payment's method, card last four, network and token", async () => {
    const { fetchImpl, seen } = razorpay({ id: "pay_1", status: "captured", amount: 500, amount_refunded: 0, method: "card", token_id: "token_1", card: { last4: "4366", network: "Visa", type: "credit" } });
    expect(await fetchRazorpayPayment(creds, "pay_1", fetchImpl)).toMatchObject({ id: "pay_1", method: "card", token_id: "token_1", card: { last4: "4366", network: "Visa" } });
    expect(seen[0]).toMatchObject({ method: "GET", url: "https://api.razorpay.com/v1/payments/pay_1" });
  });

  it("refunds a payment, lists a customer's tokens and deletes one", async () => {
    const refund = razorpay({ id: "rfnd_1", status: "pending" });
    await refundRazorpayPayment(creds, "pay_1", 500, refund.fetchImpl);
    expect(refund.seen[0]).toMatchObject({ method: "POST", url: "https://api.razorpay.com/v1/payments/pay_1/refund", body: { amount: 500 } });
    const tokens = razorpay({ items: [{ id: "token_1", method: "card", card: { last4: "4366", network: "Visa" }, recurring: true }] });
    expect((await fetchCustomerTokens(creds, "cust_1", tokens.fetchImpl)).map((t) => t.id)).toEqual(["token_1"]);
    expect(tokens.seen[0].url).toBe("https://api.razorpay.com/v1/customers/cust_1/tokens");
    const del = razorpay({ deleted: true });
    await deleteRazorpayToken(creds, "cust_1", "token_1", del.fetchImpl);
    expect(del.seen[0]).toMatchObject({ method: "DELETE", url: "https://api.razorpay.com/v1/customers/cust_1/tokens/token_1" });
  });

  it("a refusal from Razorpay is an error that carries no secret", async () => {
    const { fetchImpl } = razorpay({ error: { description: "nope" } }, 400);
    await expect(createRazorpayCustomer(creds, { name: "x", email: "a@b.test", contact: "9845671203", businessId: "biz_1" }, fetchImpl)).rejects.toThrow(/Razorpay refused POST customers \(400\)/);
  });
});
