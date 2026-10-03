# payments

Owning chunk: Chunk 14 — Billing, Invoicing & Payments.

Every kitchen collects its **own** money: its own Razorpay account and/or UPI id. Platterly never holds it (its own Razorpay account is only for the subscription, Chunk 20).

- `payment-settings.ts` — a kitchen's Razorpay keys (encrypted with `secret-box.ts`, never returned to a browser), UPI id and advance %.
- `razorpay.ts` — REST calls with the kitchen's keys, checkout and webhook signature checks.
- `payment.ts` — record / confirm / reject payments, receipts, and `syncOrderPayments` (confirmed payments drive the order's advance, balance and payment status).
- `payment-links.ts` — `PAYMENT_LINK` tokens for an advance, the balance or a custom amount; resolves the public `/pay/[token]` page.
- `checkout.ts` — Razorpay Checkout start, confirmation (idempotent: a webhook delivered twice makes one payment) and the UPI "I have paid" claim.
- `payment-math.ts` — client-safe rules (payment state, advance amount).

A UPI QR pays the kitchen directly, so Platterly cannot see it: the claim waits as `PENDING` until the team confirms it. Razorpay payments confirm through the signed webhook at `/api/webhooks/razorpay/[organizationId]`.
