# Cutover runbook: Platterly Ops takes over billing, messages and the notice

Written 2026-10-05, after steps 1 to 8 of `docs/ops-contract.md` were built. The cutover is one switch (`OPS_BILLING=1` for catering). Until it is on, catering runs on its own plan rows exactly as before, so every step before the switch can be done and undone safely. Do the steps in this order. Stop at the first failed check.

## Before the switch (nothing here changes what kitchens see)

| # | Step | How | Done when |
|---|---|---|---|
| 1 | Ops is deployed with its own database and migrations applied | `npx prisma migrate deploy` in `apps/ops` (migrations through `invoice_numbering_by_product`); `OPS_SECRETS_KEY`, `BETTER_AUTH_*`, `OPS_TRUSTED_ORIGINS` set (see `apps/ops/.env.example`) | `ops.platterly.in/api/health` answers `{"status":"ok","app":"ops"}` |
| 2 | A staff login exists | `OPS_STAFF_PASSWORD=... npm run ops:create-staff -- "Name" email` in `apps/ops` | You can sign in to ops |
| 3 | Catering is registered in ops and linked | In ops: Products, Register `catering` with its base URL; copy the two secrets into catering's `OPS_EVENT_SECRET` and `OPS_COMMAND_SECRETS`, set `OPS_BASE_URL` and `OPS_PRODUCT_KEY`; restart catering; Refresh manifest | The product page shows the manifest version, its 5 reports and actions, no error |
| 4 | Ops cron runs | Server cron every minute: `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ops.platterly.in/api/cron`; `CRON_SECRET` set in ops | The reply lists `commandsSent`, `messagesSent`, `trialNotices` and so on |
| 5 | Ops mail works | `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM` (and `EMAIL_LOGO_URL`) set in ops | Create a test business in ops (Businesses, New business) with your own email: the welcome arrives; delete or suspend it after |
| 6 | Razorpay for Platterly's own plans | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in ops; in the Razorpay dashboard add webhook `https://ops.platterly.in/api/webhooks/razorpay` with events `payment.captured` and `payment.failed` | Ops Billing shows "Razorpay connected" |
| 7 | Seller's tax details | Ops Billing: legal name, GSTIN, PAN, state code, address, SAC (998314 unless your CA says otherwise), note | Saved; the example invoice number looks right |
| 8 | Plans exist in ops | Ops Plans: the plans you sell, with prices, GST and limits, and one active trial plan for catering | Each plan lists under the product |
| 9 | Invoice prefix | Ops Products, Catering, Invoice numbering | Catering shows its prefix (the migration kept the one in use, `FP`) |

## The switch

| # | Step | How | Done when |
|---|---|---|---|
| 10 | Back up catering's database | `pg_dump "$DATABASE_URL" > catering-before-cutover.sql` (keep it) | File exists and is not empty |
| 11 | Import, dry run | `cd apps/ops && npm run ops:import-catering` | "Dry run finished" and every reconciliation line `OK` |
| 12 | Import, for real, right before the flag | `npm run ops:import-catering -- --apply` | "Committed", and the invoice number line shows catering's last number carried over |
| 13 | Switch on | Set `OPS_BILLING=1` in catering's environment and restart it | Catering restarts without errors |
| 14 | Check it | See "After the switch" | All checks pass |

## After the switch

| Check | Expected |
|---|---|
| Sign up a new kitchen | No local trial row; ops starts the trial and pushes the snapshot within seconds; Settings, Subscription shows the trial from ops; the owner gets the welcome email |
| `/subscribe` | Plans and prices from ops, GST on top; checkout opens Razorpay |
| Pay a small amount (test mode first) | Plan active, receipt email, invoice PDF numbered with the product prefix and the next number, snapshot pulled so the lock lifts |
| Ops sidebar notice | Saved in ops; every kitchen sees it within a minute or two |
| Ops Reports | Catering's five reports load; Subscriptions shows the payment |
| A trial that ends | Ops marks it locked; the kitchen shows the lock screen; the trial emails went out at 3 and 1 day |

## Rolling back

Unset `OPS_BILLING` and restart catering: it reads its own plan rows again. Anything paid through ops meanwhile has to be re-imported or recorded by hand. Nothing was dropped, so no restore is needed. The backup from step 10 is for the case where data was changed by hand.

## Not part of the cutover

The flag, the old catering plan and payment tables, the seller-profile row and `user.isSuperAdmin` stay until the cutover has run in production for a while. Removing them is a separate, reviewed migration (never in the same release as the switch).

## Known behaviours to expect

- The import's check treats "ops locked an ended trial or paid period, catering's old row still says trialing or active" as the same fact. Ops's scheduled sweep locks rows; catering locks by the date itself.
- Catering's own trial-ending and plan-ending emails stop when the flag is on; ops sends them.
- A kitchen created from ops has no owner login until the owner signs up normally.
- A deleted business is only suspended for 30 days; nothing removes its data afterwards (undecided).
