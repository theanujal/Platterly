# Store-first slice (S0 design)

Status: DRAFT for AJ's review. Documentation only. Nothing is built from this until AJ approves it.
Date: 2026-11-06. Plan reference: `docs/platform-foundation-plan.md` (F12 to F14, section 13, journey steps 5 to 8).

## 1. The plan change AJ approved (2026-11-06)

The plan puts the Store in M2, behind M1 acceptance (F11.2.1). AJ approved building a **Store slice before M1 is complete**, under one rule: **Caterly is not touched.** Integration with Caterly comes last, one flag at a time, after the Store is tested on its own.

This is an ordering change only. It does not remove any M1 work, and it does not authorise anything in the Caterly app (`src/`), the Caterly database, or the `OPS_BILLING` flag.

## 2. Scope of the slice

| Step | What | Touches | Gate |
|---|---|---|---|
| S1 | Store catalogue page at `store.localhost:3300`: plan cards, monthly/annual toggle, GST-inclusive price. Plans come from a fixture. One Playwright spec. | `apps/platform` only | AJ approval of this doc |
| S2 | Order summary page: GST details and coupon fields, no payment | `apps/platform` only | AJ review of S1 |
| S3 | Replace the fixture with the real signed, read-only Ops plans call | `apps/platform` and an additive Ops caller | Ops working tree cleaned by AJ, F12.1.1 caller design approved |
| S4 | Checkout with Razorpay test keys, verify, webhook replay, confirmation | `apps/platform`, `apps/ops` | S3, F12.2.1 (`billing_customers`, `orders`) approved |
| S5 | Coupons: percent or fixed amount, one per order | Ops, then the Store | S4 |
| S6 | Real sign-in and the business link | Platform database | Login method decided (F4.1.1 blocked on D5) |

Only S1 and S2 are covered by this document. S3 onwards each need their own approval.

## 3. Decisions recorded

| # | Decision | Source |
|---|---|---|
| 1 | Store slice goes before M1 completion; Caterly untouched until integration | AJ, 2026-11-06 |
| 2 | Test buyer is the existing kitchen admin user `kitchen@platterly.local` (Caterly dev database `platterly_dev`, owner of "Platterly Demo Kitchen") | AJ, 2026-11-06 |
| 3 | Coupon rule (D9): percent or fixed amount, one per order, with expiry, maximum uses and per-product limits | AJ, 2026-11-06 |
| 4 | Ops is not edited until AJ has cleaned up the other session's uncommitted Ops changes (`billing.ts`, schema, `platform_reader` migration) | AJ, 2026-11-06 |

## 4. What is faked in S1 and S2, and the known gap

- **No sign-in.** The pages are public and show no user. The test buyer in decision 2 is not used until S6. The identity service does not exist yet (F4.1.1 is blocked on D5).
- **No membership or billing-right check.** The plan's rule that the caller must be a member with a billing right (F12.1.1, F12.1.2) cannot be enforced yet. This is a **documented gap, closed when F3.2.1 and S6 land.** Nothing in S1 or S2 may be described as access-controlled.
- **Plans are a fixture.** The fixture is typed with `PlanOffer` and `PriceView` from `packages/contract/src/billing.ts`, so swapping in the Ops call (S3) changes the data source and not the page. The fixture figures are sample data and must be labelled as such on the page, the same way the Account prototype is.
- **No payment, no database, no network call** in S1 and S2.

## 5. S1 design

**Where.** New routes in `apps/platform` under `src/app/store/`, served only on the `store.` host. `proxy.ts` already returns 404 for unknown hosts. S1 adds a host check so the Store pages answer on `store.` only, and the Account pages answer on `account.` only. The existing Account spec (`e2e/account.spec.ts`) must keep passing.

**Page.** `store.localhost:3300/` shows:
- a heading and a short line explaining what the Store is;
- a monthly / annual toggle (annual only offered where the plan has an annual price);
- one card per plan: name, description, highlights, price, GST line, total, and a disabled "Continue" button (S2 enables it);
- a visible "Prototype with sample data" notice.

**Money.** Amounts come from `PriceView` (`amount`, `gstPercent`, `gstAmount`, `total`). The page displays them and does not recompute GST. Whole-rupee display with the existing INR formatting helper if one exists in `apps/platform`; otherwise a small local formatter.

**Test.** One Playwright spec, `apps/platform/e2e/store.spec.ts`, run alone (`npx playwright test apps/platform/e2e/store.spec.ts`, never the full suite). It checks:
1. the page loads on `store.localhost:3300` and shows every fixture plan;
2. the toggle switches the displayed price and total;
3. a plan with no annual price shows no annual option;
4. the sample-data notice is visible;
5. the same path on `account.localhost:3300` does not serve the Store, and the Store host does not serve Account pages;
6. `localhost:3300` (no subdomain) still answers 404.

**Not in S1.** Real data, checkout, coupons, sign-in, any Ops call, any change to Caterly, Ops, `packages/contract`, or the database.

## 6. Files S1 would add or change

| File | Change |
|---|---|
| `apps/platform/src/app/store/page.tsx` | new, the catalogue page |
| `apps/platform/src/app/store/_components/*` | new, plan card and toggle |
| `apps/platform/src/modules/store/sample-plans.ts` | new, the typed fixture |
| `apps/platform/src/proxy.ts` | small change: restrict Store routes to the `store.` host |
| `apps/platform/e2e/store.spec.ts` | new, the spec above |

`packages/contract` is read, not edited. No file outside `apps/platform` changes.

### 6a. As built (2026-11-06) — two differences from section 5/6

- **Routing:** no `src/app/store/` route and no `proxy.ts` change. `src/app/page.tsx` branches on the host, as it already did for Account (`account.` shows Account, `store.` shows the Store catalogue). The Account pages already answered 404 on the store host, and the spec proves it.
- **Files:** `src/components/store/{catalogue.tsx,store.css}`, `src/modules/store/sample-plans.ts`, `src/app/page.tsx`, `e2e/store.spec.ts`, and one edit to `e2e/account.spec.ts` (its placeholder test no longer expects the store host to show "Platterly store"; the store host now has its own spec).

### 6b. S2 as built (2026-11-06)

- **Page:** `store.localhost:3300/checkout?plan=<id>&interval=MONTHLY|ANNUAL`, Store host only (404 elsewhere via `requireStoreHost`). The catalogue's Continue is now a link (still off for a plan with no price at the chosen frequency).
- **Order summary:** plan, billing frequency, price, GST and total, taken straight from the plan's `PriceView`. The Pay button is disabled.
- **Billing details form:** the contract's `Buyer` fields (business name, address, city, state, PIN, optional GSTIN). "Check details" does shape checks in the browser only (6-digit PIN, 15-character GSTIN pattern). Nothing is sent or saved.
- **Coupon:** the field is shown and disabled. Coupon validation is server-side only (D9, F12.3.1), so it is not faked in the browser.
- **GST split:** a single GST line. CGST/SGST versus IGST needs the buyer's state against Platterly's state and comes with real checkout (S4).
- **Known gaps:** no sign-in, no business link, no server validation, no payment. Same as section 4.

## 7. Open points (do not block S1)

- Login method for S6 (D5).
- Whether the Store gets its own layout or reuses the Account shell. S1 proposes its own layout, as the plan says (F14.1.1: "own layout").
- Annual-plan fixture figures: S1 uses invented sample numbers; real prices come from Ops in S3.

## 8. Rules that apply while building

One approved step at a time. No Git commit or push without fresh approval from AJ. One Playwright spec at a time, headless. After code changes, `graphify update .`. Stop and report on any failure.

## 9. Revision 2 (2026-11-06): functional reference from AJ (two Zoho Store screens; not a visual design reference)

AJ shared two screens as a **functional** reference. S1 and S2 as built (a plan grid and a one-page order summary) are replaced by the flow below. Build waits for AJ's answers to the two open questions in 9.4.

### 9.1 What the reference shows, and how it maps to Platterly

| Reference | Platterly Store |
|---|---|
| Home with tabs "Subscribed / Free / Unaccessed Services", a search box | Home with tabs **Subscribed products, On trial products, Unsubscribed products, Bundles** (AJ's addition), plus search |
| "Annual Subscriptions" heading with an "All" filter | Billing-frequency filter (All, Monthly, Annual) with subscriptions grouped under it |
| Subscribed card: product icon and name, plan name, next renewal date, renewal amount per period, **Manage** | Same card. Data per card: product, plan, interval, next renewal date, renewal amount |
| (no equivalent) | **On trial card:** product, trial end date and days left, **Choose a plan** |
| (no equivalent) | **Unsubscribed card:** product, one line of what it does, **View plans** |
| Manage page "Manage your X Subscription" with three steps: Change Plan, Confirm Order, Confirmation | Manage page for **one product**, with the steps **Choose plan, Confirm order, Payment, Confirmation** (Payment added, per AJ) |
| Plans grouped (Mail Plans, Workplace Plans) with a price per period and a month-to-month price | All plans of that product, with monthly and annual prices |
| Plan buttons: **Downgrade**, **Current plan**, **Upgrade** | Same three labels, decided by comparing each plan with the current plan |
| "Show Features", "Compare Plans in Detail", "Cancel Subscription", a back arrow | Show features (the plan highlights), compare plans, cancel (see 9.3), back |

### 9.2 Rules carried over from the existing billing design (unchanged)

- One subscription per business and product; a separate invoice per product.
- An **upgrade** is charged now. A **downgrade** is **not charged now**: it is scheduled and starts at the next payment (docs/ops-contract.md 8.1). The Confirm order step must say so, with the date.
- Monthly auto-pay is a Razorpay subscription; annual is a one-off order. A paid grace of 7 days applies after a period ends (trials get none).
- Amounts always come from the plan's `PriceView`; the page shows them and never recomputes GST.

### 9.3 Items that need a decision or are not Store scope yet

- **Bundles are M3 (F18), and AJ's 2026-10-05 decision says "do not build a Bundle entity yet".** AJ now wants them on this screen. Proposed handling: a **Bundles tab built from sample data only, in the prototype**, with no Bundle entity, no Ops change and no checkout. Needs AJ's confirmation (9.4, question 1).
- **Add-ons** (reference: "Features & Add-ons") are M3 (F18.2.1). Only features are shown.
- **Cancel subscription** exists in Ops as an auto-pay cancel (the paid days run out as usual). In the prototype it opens a confirmation and does nothing else.
- **Free services** (reference tab) has no counterpart; not included.

### 9.4 Open questions for AJ

1. Bundles tab as sample-data-only UI in the prototype, with checkout for bundles left for M3?
2. Payment step: a sample panel with a clearly labelled "Simulate successful payment" button so the whole flow can be seen end to end, until real Razorpay checkout (S4)?

### 9.5 Revised slice order (S1 and S2 above are superseded by R1 to R4; S3 onwards unchanged)

| Step | What | Data |
|---|---|---|
| R1 | Store home: four tabs, search, interval filter, product cards for subscribed, on-trial and unsubscribed products | Sample products (Caterly subscribed, Rivo on trial, one unsubscribed) |
| R2 | Manage page for one product: its plans, Upgrade / Downgrade / Current plan, features, compare, cancel confirmation | Sample plans (the existing `PlanOffer` fixtures, extended per product) |
| R3 | Confirm order (summary, billing details, upgrade-now versus downgrade-later wording), then Payment (sample), then Confirmation | Sample |
| R4 | Bundles tab: bundle cards with included products and price | Sample only, pending 9.4 question 1 |

Each step ends with one Playwright spec run alone, and AJ's review before the next. The existing `store.spec.ts` tests are rewritten with the pages they cover.

### 9.6 Answers and as-built (2026-11-06)

- AJ answered 9.4: **yes** to a sample-data-only Bundles tab (bundle checkout stays M3); **yes** to a sample Payment step with a "Simulate successful payment" button.
- **Built (R1, R2, R3 and the Bundles tab of R4):** Store home (`/`, four tabs, search, billing-frequency filter) and `/manage/<product>` (plans with Upgrade / Downgrade / Current plan or Subscribe, features, compare, cancel confirmation, then Confirm order, Payment (sample), Confirmation). Both are Store-host only.
- **Sample data:** `src/modules/store/sample-catalogue.ts`: Caterly (subscribed, annual, Growth), Rivo (subscribed, monthly, Plus), Stockroom (on trial), Tabletop (unsubscribed), one bundle. Saving figures are worked out from the plan prices, not typed. Names and prices are invented; only Caterly and Rivo are real product names.
- **Downgrade** skips Payment: nothing is charged today and the plan starts at the next renewal (the stepper drops the Payment step).
- **Current plan** is disabled on both billing frequencies. Switching the same plan between monthly and annual is **not** offered in the prototype; its rule is undecided (the existing Caterly page treats a same-plan purchase as a renewal).
- **Not built:** add-ons, free services, real bundle checkout, anything real behind Payment or Cancel.
- **Removed:** the earlier single `/checkout` page and plan grid (superseded).

### 9.7 Current state (2026-11-06; supersedes 9.1 to 9.6 where they differ)

- **Look:** the original centred layout: header block, pill toggles, plan-card style for every card. The Store home has a search box and four tabs; there is **no billing-frequency filter and no Annual/Monthly grouping**.
- **Manage steps:** a numbered progress bar with **three steps: Choose plan, Confirm payment, Confirmation**. Confirm payment is one screen: billing details, the disabled coupon field, the sample payment note and amount, and one button, "Simulate successful payment". A downgrade shows Choose plan, **Confirm downgrade**, Confirmation and has no payment.
- **Plan features** are always shown on each card (no show/hide). "Compare plans in detail" is still collapsible.
- **Header and footer on every Store page:** header with the logo link, Help and a "Sample account" chip (stands in for sign-in); footer with Contact us (hello@platterly.in, +91 7624964646) on the left, Talk to our sales on the right, and a link row: Platterly.in, Terms of Service, Privacy Policy, Security, Refunds. Links go to `https://platterly.in/...` and work once the marketing site is deployed.
- **Open decision (AJ):** the plan puts upgrade, downgrade and cancel in the Account's Subscriptions page (F13.1.1) and the subscription overview in F13.3.1. The prototype has them in the Store. Decide whether Manage stays in the Store or moves to Account, and whether the Store-first ordering stands, before real data is wired in.
