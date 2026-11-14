# Payment methods for renewals (step 3b)

Decided with AJ on 2026-11-14, after a Razorpay test-mode spike the same day. Built on what Platterly's Razorpay account supports today; no request to Razorpay.

## Decisions (AJ)

| # | Decision |
|---|---|
| 1 | A business keeps a list of saved payment methods. One is the **primary**; only the primary is ever charged. Nothing is charged from a secondary, and there is no automatic fallback. |
| 2 | At least one method must always stay registered. The last method can be replaced, never removed. |
| 3 | Only the business's active Admin adds, changes or removes methods (same rule as buying). |
| 4 | A **monthly** plan cannot be bought without a registered method (it is bought as an auto-pay). An **annual** plan above Rs 15,000 follows the RBI e-mandate rules: no silent debit; the customer gets a renewal reminder with a Store pay link and authenticates each year. |
| 5 | UPI AutoPay can be a primary method. A UPI method cannot be kept as a saved secondary (UPI has no saved-method equivalent). |
| 6 | Making a saved method the primary needs the customer to authorise it at that moment (an OTP or UPI approval). Razorpay offers no way to swap the method of an existing subscription, so this is the design, not a gap. |

## What the spike proved (Razorpay test mode, 2026-11-14)

| Question | Result |
|---|---|
| Subscription that starts in the future | Accepted. Checkout charges a Rs 5 authentication amount which Razorpay **refunds by itself**; the plan price is charged on the start date. Status `authenticated`, `paid_count` 0, no invoice, `charge_at` = `start_at`. |
| Saved methods, listed with a label | `GET /customers/{id}/tokens` returns method, card last four, network, `recurring`, status `confirmed`. The database keeps labels only, never card data. |
| Card saving | Razorpay requires the card to be saved for recurring payments ("as per RBI guidelines"). Documented recurring test card: Visa 4718 6091 0820 4366, any CVV and future expiry, any 6-digit OTP in test mode. Other test cards say "not eligible for recurring payments". |
| Several recurring tokens on one customer | Yes, through token registration: an order with `customer_id`, `method: card` and `token` terms, opened in Checkout with `order_id`, `customer_id` and `recurring: "1"`. |
| The Rs 5 of a **token registration** | **Captured, not refunded.** Ops must refund it (`POST /payments/{id}/refund`, accepted). |
| Remove a saved method | `DELETE /customers/{id}/tokens/{token}` returns `deleted: true`. |
| Charge a chosen token from Ops | **Not available on this account** (`POST /payments/create/recurring` answers "not found"; Razorpay activates it per account). Not used. |
| Swap the method of an existing subscription | No documented way. Updatable fields are plan, quantity, remaining count and when the change applies. |
| UPI AutoPay with a future start | Not tested yet. |

## Model

- **Razorpay customer**: one per business (`razorpay_customer`), created on first need. Every authorisation passes its id so Razorpay can list the saved methods.
- **payment_method** rows: id, business, kind (`CARD`, `UPI`, `EMANDATE`), label ("Visa ending 4366", "UPI name@bank"), Razorpay token id (cards), and the Razorpay subscription it authorised (null for a method saved only as a secondary).
- **Primary** is derived, never stored: the method whose subscription is the business's current auto-pay subscription.

## Flows

| Flow | Steps |
|---|---|
| First monthly purchase | Store opens Razorpay's auto-pay window (a subscription with `customer_id`); first charge is the first month; on verify Ops records the method from the payment (label, token). |
| Add a saved method (card) | Ops creates a Rs 5 token-registration order; Checkout; on verify Ops records the method and **refunds the Rs 5**. |
| Make a method primary | Ops creates a new subscription for the same plan with `start_at` = the current paid period's end; Checkout authorises it (Rs 5, refunded by Razorpay); on verify Ops points the business's subscription at the new one, cancels the old one, and the next renewal charges the new method. If authorisation fails nothing changes. |
| Remove a saved method | Refused for the primary and for the last method; otherwise Ops deletes the Razorpay token and the row. |
| Annual renewal | Reminder email and WhatsApp with a Store link; one-time payment as today. |

## Open points

- UPI AutoPay with a future start and its label (VPA) are untested; check in test mode before relying on them.
- A renewal charge for a switched subscription must find the business's last paid payment by business and product, not by Razorpay subscription id (it has none yet): `chargeAutoPay` needs that lookup.
- Renewal reminders point to Caterly's `/subscribe`; annual reminders need the Store address as a new Ops setting.
