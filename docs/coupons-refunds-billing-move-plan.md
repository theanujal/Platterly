# Coupons, refunds, and moving Caterly's billing pages to the Store

Date: 2026-11-14. Status (2026-11-15): C1-C4, R1-R4 and M1/M2 are BUILT, committed and pushed (`signin`, `08f4c60`). Decisions by AJ, 2026-11-14 and 2026-11-15.

## Decisions

| # | Decision | Source |
|---|---|---|
| 1 | Coupons are percent or fixed amount, one per order, no stacking (D9). Expiry, maximum uses and per-product limits as in `store-first-slice-design.md`. | AJ, 2026-11-06 and 2026-11-14 |
| 2 | A coupon discounts the FIRST payment only: the one yearly payment, or the first month of monthly auto-pay. Renewals charge the full price. | AJ, 2026-11-14 |
| 3 | Refunds are REQUESTED by the Business Admin in the Store and APPROVED by Platterly staff in Ops. Staff decide the amount (up to what was paid). | AJ, 2026-11-14 |
| 4 | On approval staff choose: end the plan now (kitchen locks) or keep it to the end of the paid days with no renewal. | AJ, 2026-11-14 |
| 7 | A refund can only be requested within 7 days of the payment; staff may still decide later. The request lives in the Account only (never the Store). The kitchen gets the credit note by email attachment, WhatsApp link and Account download. | AJ, 2026-11-15 |
| 8 | Caterly gets a read-only Subscription page back for roles with "Billing and Plan" (plan: `caterly-billing-view-plan.md`); this partly reverses decision 5 (read only, no buying). | AJ, 2026-11-15 |
| 6 | Caterly's User Profile page is removed too (AJ, 2026-11-14): name, phone and email live only in the Platterly Account. Caterly keeps a link to the Account profile where the page was. | AJ, 2026-11-14 |
| 5 | Caterly's own billing pages go away; billing lives in the Store/Account only. A locked kitchen shows Sign out plus: Renew (Business Admin, opens the Store) or "Ask your Admin to renew" (everyone else). Invoices are viewed in the Store. | AJ, 2026-11-14 |

## Slices (each ends with a surgical Playwright spec or, for Ops-only logic, unit tests, then a status table)

| Slice | What | Where |
|---|---|---|
| C1 | Coupon model, math (percent/fixed, GST on the discounted amount, never below zero, first payment only), validation (expiry, max uses, per-product, one per order) | Ops + unit tests |
| C2 | Staff screen to create, pause and list coupons, with uses | Ops |
| C3 | Store checkout coupon field (server-side validation only), discount shown in the summary, recorded on the payment and invoice | Platform (Store) + Ops signed call |
| C4 | Monthly: discount only the first month (Razorpay subscription needs a first-charge amount different from the plan amount; spike this FIRST, it is the main risk) | Ops + Platform |
| R1 | Refund model (`refund_request`, `refund`), math (partial or full, GST share, credit note numbering), Razorpay refund call | Ops + unit tests |
| R2 | Store: "Request a refund" on a paid payment (Business Admin only), request status | Platform (Store) |
| R3 | Ops: approval queue, amount and "end now / keep to period end", credit note PDF, emails to the Admin | Ops |
| R4 | Failed-auto-pay "Payment due" line (agreed with D-C) | Store, Account |
| M1 | Remove Caterly's `/subscribe`, `/settings/subscription`, pay actions, plan invoice pages; locked screen with Renew or "Ask your Admin"; keep the Ops snapshot read (status, limits) | Caterly |
| M2 | DONE 2026-11-14 (uncommitted), covers User Profile AND Change Password: removed both link-only pages and their nav entries, added "Your Account" to the top-right menu. Remove Caterly's read-only User Profile page (`settings/account/user-profile`); the settings menu entry and user-menu item open the Account profile instead; update `user-profile-readonly.spec`, `account-to-caterly.spec`, `responsive.spec` | Caterly |

## Built (2026-11-15)

C1-C4 coupons (Ops rules and Coupons screen, Store checkout field, monthly first-month discount through a delayed start and an add-on); R1-R4 refunds (Ops tables and maths, Admin request in the Account, Ops Refunds page with end plan now or keep to period end, credit note PDF and emails, "Payment due" after a failed auto-pay); M1 and M2 (Caterly billing, profile and password pages removed). Not proven for real: a real Razorpay refund, renewal charge and webhook delivery (go-live).

## Open risks

- C4 depends on Razorpay allowing a different first charge on a subscription (an add-on or offer on the first cycle). If not, the fallback is a one-time discounted first month plus an auto-pay start date one month later; to be decided with AJ after the spike.
- Caterly's existing paid kitchens and imported payments (`importedFrom`) keep working; M1 removes pages, not data.
- Migrations are additive. They are applied to the real databases only on AJ's yes, per the usual recipe.

## Order of work

C1, C2, C3, C4 (coupons complete), then R1 to R4 (refunds), then M1. M1 comes last so a locked kitchen always has a working Store to go to.
