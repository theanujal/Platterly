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
- ~~A renewal charge for a switched subscription must find the business's last paid payment by business and product~~ Done 2026-11-14 (3b.1b): `chargeAutoPay` falls back to the Subscription row.
- Renewal reminders point to Caterly's `/subscribe`; annual reminders need the Store address as a new Ops setting.

## Built (3b.1b, 2026-11-14, Ops only)

`apps/ops/src/modules/billing/methods.ts` implements the flows above (`startAddCard`/`verifyAddCard`, `startMakePrimary`/`verifyMakePrimary`, `removeMethod`, `listMethods`, `recordMethodFromPayment`); the caller must already have checked the person is the business's active Admin. Behaviour worth knowing:

- A Razorpay customer needs the owner's email and mobile number; without them a monthly purchase or card add is refused with a message saying which is missing.
- `verifyMakePrimary` accepts only a subscription this business started (notes carry business, product and purpose) that Razorpay reports `authenticated` or `active`; otherwise it cancels it and changes nothing. It points the subscription row first, then cancels the old one, so the old one's cancelled webhook is ignored. The old card stays as a secondary; an old UPI method is deleted (decision 5).
- The Rs 5 refund of a card registration that fails keeps the card and raises a staff alert.
- Not built yet: routes and `proxy.ts` entries (3b.2), recording the first method from a verified monthly purchase (3b.2), Account page (3b.3), annual reminders (3b.4).

## Built (3b.2, 2026-11-14, Ops and Platform; proven in a browser for the monthly purchase)

- **Monthly plans are auto-pay only** in the Store (AJ): the Store's `checkout` for MONTHLY always starts a Razorpay subscription for the business's customer; yearly stays a one-time order. A monthly plan is charged at its own price with **no upgrade credit** (Option A); credit applies to yearly purchases only (`quoteCheckout`).
- **First method:** after a verified auto-pay purchase Ops saves the method the window's payment was made with, as the primary (`recordFirstMethod`; a failure never undoes the payment).
- **Six signed actions** under `/api/platform/businesses/{id}/products/{key}/billing/`: `methods`, `method-add`, `method-add-verify`, `method-primary`, `method-primary-verify`, `method-remove` (contract path pattern, route files, proxy tests). Platform side: `/api/store/methods` with an `action` field, all behind `billingAccess`.
- **Pause and stop** of auto-pay move to the Account (AJ); not built.
- **Browser proof:** `apps/platform/e2e/store-live-autopay.spec.ts` (monthly purchase, first method saved as primary, primary removal refused). Still untested in a browser: add card, make primary, remove a secondary (3b.3), UPI AutoPay, a renewal charge.

## Built (3b.3, 2026-11-14, Account page and auto-renewal; proven in a browser)

- **Account `/payment-methods`** (Admin only): per product the plan, auto-pay state, next charge date and saved methods (Primary badge); Add card, Make primary, Remove (not the primary, not the last). `/api/account/payment-methods` GET lists and POST takes the same actions as the Store's `/api/store/methods`.
- **Auto-renewal** (Pause, Resume, Stop) moved here from the Store: Ops actions `autopay-pause`, `autopay-resume`, `autopay-cancel`. Stop is for good (the person starts again from the Store); paid days keep working, then the 7-day grace and the lock. The Store's monthly "Cancel subscription" is replaced by a note linking to the Account; a yearly plan still has its Cancel (stop renewal) in the Store.
- **Re-tokenisation:** authorising a saved card in Razorpay's window issues a new token for the same card. `verifyMakePrimary` keeps the chosen card's single row, takes the new token and deletes the old one at Razorpay; a different card chosen in the window is saved as its own method.
- Razorpay's test Mastercard is not eligible for recurring, so browser specs use the Visa 4718 6091 0820 4366 for every method.
