# Sign-up with a paid plan (plan, revision 3, for AJ's review)

Status: **BUILT and proven in a browser (2026-11-14).** Revision 3 approved by AJ, 2026-11-14. Builds on `docs/single-signup-business-plan.md` (built and committed).

### What was built (summary, see the commit for detail)

| Piece | Where |
|---|---|
| Plan carried on the signed sign-up address, saved with the identity (`planCode`, `interval`, `reservedBusinessId`, `status`, `verifiedAt`; identity migration `0014`) | `apps/platform/src/modules/auth/sign-up-origin.ts`, `idp.ts`, `identity/migrations/0014_signup_paid_plan.sql` |
| Caterly's sign-in start passes `?plan=&interval=` to the central sign-in | `src/app/api/platform/sso/start/route.ts` |
| Marketing site paid cards start a paid sign-up (monthly button, "Pay yearly instead" link) | `apps/site/src/app/caterly/page.tsx`, `src/lib/pricing.ts` |
| Verification of a paid sign-up makes no business; the verify page sends the person to the Store with the plan | `signup-business-run.ts`, `components/auth/forms.tsx` |
| Store accepts a buyer with no business yet (the reserved id), opens on the chosen plan, shows "Continue to Caterly" after paying | `modules/store/pending-buyer.ts`, `billing-rights.ts`, `products.ts`, `app/manage/[product]/page.tsx`, `components/store/manage-flow.tsx` |
| Ops: `register-pending` and `abandon-pending` signed actions, Abandoned-orders table, page and 90-day clean-up | `apps/ops/.../platform-checkout.ts`, `prisma/migrations/20261114150000_abandoned_order`, `src/app/(app)/abandoned-orders` |
| Completion after payment (from the Store and from the scheduled check), abandon step, re-sign-up replacement, sign-in refusal | `modules/organisations/paid-signup.ts`, `paid-signup-run.ts`, `app/api/cron/paid-signups/route.ts`, `idp.ts` |
| Caterly pulls its plan from Ops when the owner joins | `src/modules/platform-link/pending.ts` |

### Proof

`e2e/paid-signup.spec.ts` (3 tests, real Razorpay TEST checkout, throwaway databases): the paid yearly journey (nothing in the product or Ops before payment, no trial row ever, ACTIVE yearly plan after, Caterly opens with the plan); an unpaid sign-up cannot sign in, is cleared after the window with its details kept on Abandoned orders, and the email signs up again; signing up again before the window replaces the unpaid one. Failing-first: with the plan ignored all three fail.

### Left open

- `Caterly /subscribe` and `/settings/subscription` are unchanged: they serve existing kitchens. Whether they hand over to the Store is AJ's call.
- The marketing site's built-in fallback cards have no plan code, so they start a trial sign-up; only Ops-supplied cards start a paid one.
- The identity migration `0014` and the Ops migration `20261114150000_abandoned_order` are NOT yet on the real databases (applied to throwaway copies only).
- Nothing schedules `/api/cron/paid-signups` yet (go-live list). A paid person who closes the browser after paying is completed by that check; until then they complete at their next Store visit.
- "Paid and the browser closed" is proven by unit tests of the decision rules and by the idempotent replay, not by a browser run.

## The rules (AJ, 2026-11-14)

- Journey: **Product > Select paid plan > Sign up > Store > Payment > Back to the product.**
- A **trial** sign-up gets the trial, as built. A **paid** sign-up gets **no trial days, ever**.
- Payment is central. The product tells Ops nothing about a paid sign-up; the Account and the Store do.
- The product account does not exist until the payment succeeds, and then it is unlocked at once.
- **An abandoned or rejected payment leaves no account behind.** The person's details move to an **Abandoned orders** page for follow-up. The email is **free**: they can sign up again at any time, and are never banned or treated as "already registered".
- **A person who comes back with an unpaid choice does the whole process again.** There is no special return gate.
- Plans always come from Ops (verified: the Store, Caterly's pricing and the marketing site all read Ops).

## What exists at each stage of a paid sign-up

| Stage | Identity (sign-in record) | Platform user and business | Ops | Product |
|---|---|---|---|---|
| Signed up, not verified | yes (unverified, as today) | no | no | no |
| Verified, at the Store, not paid | yes, marked **pending payment** | no business. Only a reserved business id is held. | the business and product registered, **no subscription, no trial** | no |
| **Paid** | yes | business, Admin and product link made now | plan ACTIVE | business adopted, unlocked |
| **Abandoned** (no payment within the window) | **deleted** | none | registration removed, **one Abandoned-orders record kept** | no |

So a paid sign-up never has a Platform business or a product account before payment, and an abandoned one disappears except for the Abandoned-orders record.

## Target flow

1. The product's pricing page lists Ops's plans. Choosing a paid plan sends the person to the central sign-in with the plan and interval added to the request. The provider signs the whole request, so the plan cannot be forged.
2. Sign-up saves the product and the plan choice, and **reserves a business id**, with the new identity.
3. The OTP verifies the email and signs the person in (built). For a paid sign-up the Account stops there: **no Platform business, no product link, no message to the product**. The person is sent to the **Store checkout with the plan pre-selected**.
4. Starting the checkout, the Platform makes sure **Ops knows the business and product** under the reserved id, with the owner's details (a signed Platform-to-Ops call, same secret as the Store's other billing calls). Ops records them with **no subscription and no trial**.
5. The person pays. Ops verifies Razorpay's signature and starts the plan as ACTIVE (the existing flow, unchanged).
6. The Platform now **completes the sign-up**: it creates the business under the reserved id with the person as Admin, attaches the product, queues `organisation.link` then `membership.changed`, and delivers at once.
7. The product adopts the business, seats the owner, and **pulls its plan from Ops immediately** (`pullSnapshot` exists), so it opens with the paid plan.
8. The Store's confirmation shows **Continue to Caterly**, and the person goes into the product's onboarding.

## Abandoned, closed or rejected payments

- The person may retry in the Store for the length of the **window** (proposed: 24 hours from verification).
- When the window ends, or the same email signs up again before it ends, the **abandon step** runs: the Abandoned-orders record is written, then the identity, the Platform user rows and the Ops registration are deleted. The email is free again.
- The abandon step **never deletes anything that has a paid payment**. It asks Ops first.
- Until the window ends, a **password sign-in** by that unpaid identity is refused with "Your sign-up was not completed. Please start again from the product." Signing up again is always allowed and replaces the unpaid one.

## Paid but never completed (the dangerous case)

A person can pay and close the browser before returning to the Store. The completion in step 6 must not depend on them coming back, so a **scheduled check** looks at every pending sign-up, asks Ops whether the business has an ACTIVE plan, and completes the sign-up if so. The abandon step runs only after that check says "not paid". Without this, someone could pay and have nothing.

## The Abandoned-orders page (in Ops)

| Column | Notes |
|---|---|
| Name, email, business phone | as entered at sign-up |
| Product, plan, interval | what they chose |
| Signed up at, how far they got | verified, opened the Store, payment started, payment failed |
| Expires / status | open, followed up, removed |

It is a staff page in Ops for follow-up. Open points: how long records are kept (proposed: 90 days, then deleted), and the privacy page must say that details given at a started sign-up are kept for follow-up.

## What I checked

| Check | Result |
|---|---|
| Plans come from Ops everywhere | Yes: Store (signed reader), Caterly (billing API), marketing site (Ops content bundle). The site also holds built-in fallback prices; I'd confirm they can never be shown to a paid sign-up. |
| Ops can take a payment for a business with no subscription | Yes. Checkout needs only that Ops knows the business and product. |
| `startTrial` skips when a plan exists | Yes. After payment a plan exists, so a later sign-up message cannot start a trial. |
| `createOrganisation` can use a reserved business id | Yes (`organisationId` input, already used by the product-reported path). |
| The product can fetch its plan on demand | Yes, `pullSnapshot`. |
| The Store can open with a plan pre-selected, and show "Continue to the product" | No. To build. |
| The Store can take a buyer who has no business yet | **No.** Today it needs a business and an Admin. To build: a pending-sign-up buyer, found from the session. |
| Sign-up with an email that already has an unpaid identity | **Not handled.** Today it would be refused. To build. |

## Data changes (additive)

- Identity migration `0014`: plan code, interval, reserved business id, status and created time on `signupProduct`.
- Ops: one table for Abandoned orders and its page; a signed Platform-to-Ops action to register a business and product with no plan, and one to remove an unpaid registration.
- No change to `organisation.link`, `business.signed_up` or the trial path.

## Build steps (each proven before the next)

1. **Carry the plan** and reserve the business id at sign-up. Test: a plan link saves plan, interval and reserved id; a trial link saves none.
2. **Paid verification stops early:** no Platform business, no messages to the product, redirect to the Store. Test: after the OTP there is no organisation and no outbox row.
3. **Store for a pending buyer** with a pre-selected plan; Ops registration with no subscription. Test: Ops has business and product and no subscription, no trial.
4. **Completion after payment**, from the Store and from the scheduled check. Test: pay and close the browser; the scheduled check still completes the sign-up.
5. **Product adopts, pulls its plan, "Continue to Caterly".** Test: owner seated, plan ACTIVE in the product, onboarding opens.
6. **Abandon step, re-sign-up and the sign-in refusal.** Test: an unpaid sign-up expires, its email signs up again and works; a paid one is never deleted.
7. **Abandoned-orders page in Ops.**
8. **End to end on throwaway databases with real Razorpay test checkout:** paid yearly sign-up to payment to onboarding (Ops shows an ACTIVE plan and never a trial); payment rejected, then abandoned, then the same email signs up again; trial sign-up unchanged.

## Failure cases to prove

| Case | Expected |
|---|---|
| Payment closed, failed or rejected | No trial, no product, retry works inside the window |
| Window ends unpaid | Abandoned-orders record written, identity, user and Ops registration deleted, email free |
| Same email signs up again while unpaid | Old unpaid one replaced, new sign-up proceeds |
| Paid but browser closed | Scheduled check completes the sign-up; never deleted |
| Paid and the product is unreachable at hand-over | Messages retry; the Store says the product is being set up |
| Verification repeated | Same reserved id, nothing doubled |
| Trial sign-up | Unchanged |

## Open for AJ

1. Confirm the stages table above, especially that a paid sign-up has **no Platform business until it pays**, and the identity is deleted when abandoned.
2. The window length: 24 hours proposed.
3. Abandoned-orders retention (90 days proposed) and the privacy-page wording.
4. Where do the product's pricing links live today? Caterly's pricing page and the marketing site both need to send people to the central sign-in with the plan chosen.
