# Permanent erasure of a deleted account (built 2026-11-16)

Decided with AJ: after staff approve an account deletion the business is suspended and restorable for 30 days. The final removal is a **staff "Erase now" button** in Ops (not a timer). Invoices and payment records stay, without the contact person's name, email and phone.

## Flow

| Step | Who | What |
|---|---|---|
| 1 | Staff, Ops `/account-deletions` | On an APPROVED request: type the person's email, press **Erase now** (`requestAccountErasure`). |
| 2 | Ops to each product | `business.erase` command (typed confirmation = business name). Caterly erases only a business already SUSPENDED for deletion (`eraseTenant`): audit trail, subscription copy, tenant data (cascade), the organisation and the people who worked only there. A product that refuses stops everything. |
| 3 | Ops | `anonymiseBusinessRecords`: owner name/email/phone cleared, business renamed "Erased business xxxxxx", product billing profiles, saved payment methods and Razorpay customer link removed, message-log addresses cleared, `contactName/Email/Phone` removed from every payment's `buyer` and invoice snapshot (legal name, address, GSTIN, numbers and amounts stay). The request keeps the logo links (`eraseLogoUrls`) and `eraseRequestedAt`. |
| 4 | Platform (pull, so Ops never calls it) | The scheduled pass (`/api/cron/account`) sees `eraseRequested` in the status answer and runs `eraseAccount`: central records (slots released with their history event, then the organisation with members, product links, roster, transfers; then the Platform's user, identity link and legacy mappings), then the identity person (cascades sessions, accounts, sign-in history, devices, recovery email, two-step, profile, notification choices, deletion request), emailed codes for their address, the photo file and the logo files the Platform hosts. A receipt row with no personal details (`erasureReceipt`) remembers the erase until Ops is told. |
| 5 | Platform to Ops | `POST /api/platform/account-deletions/erased` (signed). Ops closes the request as **ERASED** and wipes its name, email, phone, reason and business name. A report lost to an outage is repeated by the next pass. |

## Left on purpose
- The Platform's `audit_logs` is append-only by design; it keeps ids and decisions (and one `organisation.erased` row), no contact details.
- Razorpay's own customer record is not deleted by this (no call is made to Razorpay).
- Stand orders (printed stands) keep their shipping records in Ops.

## Tests
Ops `account-deletions` (staff step, anonymise, report), Caterly `tenant-purge/__tests__/erase.test.ts`, Platform `deletion-ops.db.test.ts` (erase, receipt, report, sync) and `erase-platform.db.test.ts` (real constraints, rolled back), browser `e2e/deletion-block.spec.ts` (sign-in block and Erase now end to end on the dev databases; needs `CRON_SECRET` and `IDENTITY_DATABASE_URL`).

## Deploy
Ops `prisma migrate deploy` (additive: `20261116150000_account_erasure`, `20261116151000_erase_logo_urls`; `20261116140000_drop_billing_customer` drops the old single billing record). Platform `identity:migrate` (`0016_erasure_receipt`). Set `CRON_SECRET` on the Platform and call `POST /api/cron/account` on a schedule. Restart Ops, Platform and Caterly after migrating.
