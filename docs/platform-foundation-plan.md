# Platterly shared foundation: technical plan v2.1

## Context
Planning and validation only. **Already authorised, before roadmap approval:** documentation (including the audit and mapping documents and the decision questions), staging preparation as setup only (requirements and runbook, no deployment of new authentication), and the isolated identity spike on scratch code outside the repository, run locally. **Authorised only after AJ's written approval of this roadmap:** the W0 and W1 work that changes the repository, namely the local platform environment and `apps/platform` scaffold, the read-only Member duplicate audit, the Ops product-list endpoint (`F6.1.0`), and the Platform Core data layer, all local. **Not authorised by either of these:** staging deployment of new code, production deployment, production authentication changes, billing cutover and customer migration; each needs the later gates in Part 1, section 15 (Permanent release process) and AJ's separate approval. **Local-first rule (Part 1, section 15, Permanent release process): everything is built and fully tested on AJ's machine and reviewed by AJ before any staging deploy; staging never replaces local testing; production needs separate explicit approval.** Wherever sections 1 to 14 say "staging", read "local first (G1 to G3), then staging (G4)".

Fixed decisions: identity before go-live; 3 existing customers (old system) migrate in afterwards; extend Ops for commerce; Caterly keeps Better Auth as its only session engine; Platform Core / Account / Store / Ops / products stay separate modules (Account and Store in one deployment at first).

## 1. Better Auth OIDC provider: what is proven and what the spike must prove
Proven today (read-only `npm view`, 2026-11-01):
| Fact | Result |
|---|---|
| Package | `@better-auth/oauth-provider`, description "An oauth provider plugin for Better Auth" |
| Licence | MIT |
| Maintenance | Released in lockstep with `better-auth` (1.7.14 on 26 Oct, 1.7.15 on 1 Nov 2026); 1.8 betas running; versions exist back to 1.4.x |
| Dependencies | `jose` ^6, `zod` ^4 |
| Compatibility | Peer `better-auth ^1.7.15`, `better-call 1.4.4`, `@better-fetch/fetch 1.3.3`. **Installed is 1.7.4 (root and `apps/ops`), so the identity service needs better-auth ≥1.7.15.** A same-minor bump, but a dependency change that needs its own test run |
| Also available | `@better-auth/sso` 1.7.15 (a different thing: SSO consumer for enterprise IdPs, not needed) |
| Installed 1.7.4 | Has `generic-oauth` (relying party), `jwt`, `bearer`, `multi-session`, `one-time-token`, `email-otp`, `organization`. No provider |

Not yet proven (spike checklist; pass or fail each, in a scratch project with the 1.7.15 packages, never in the app):
| Feature | Needed for |
|---|---|
| Discovery document and JWKS, key rotation | Token validation by products |
| Authorization code + PKCE (S256), exact redirect URI match, state and nonce | Login |
| Refresh tokens, rotation and revocation | Session renewal |
| ID token custom claims (`sub`, `email_verified`, memberships version) | Role/permission design |
| `prompt=none` and `max_age` | Silent re-auth, step-up |
| RP-initiated logout (`end_session_endpoint`) and **back-channel logout** | Cross-product logout, revocation |
| First-party client skip-consent, client registry (static clients, not dynamic) | Catering, Rivo, Ops |
| Existing `Account.password` hashes work unchanged; `User.id` as `sub` | Password and ID stability |
| Rate limiting and brute-force protection on auth endpoints | Security |
| Gaps versus Logto Cloud: hosted login UI, MFA, social login, audit trail, admin console | Decide build effort versus cost |
Decision rule: if any of discovery, PKCE, back-channel logout or custom claims fails, Better Auth route is closed and the Logto Cloud result decides. Spike also records Logto password-import support for Better Auth's hash format (unverified until tested).

## 2. Organisation claims: lifecycle and recovery
A claim = `(claimId, businessId, role=owner, boundEmail, status, expiresAt, issuedBy, supersedes)`. Statuses: `pending`, `consumed`, `expired`, `revoked`, `superseded`.
| Situation | Rule |
|---|---|
| Normal | Owner signs in with verified `boundEmail`; one transaction consumes claim and creates membership. `UPDATE … WHERE status='pending'`; unique `(businessId, userId)` |
| Expired | Claim expires (14 days). Staff or the existing owner re-issues from Ops/Account; re-issue creates a new claim, marks the old `superseded`. Same `businessId`, so no new organisation |
| Wrong contact email | Claim not consumed (nobody verifies it). Staff revokes and issues a new claim to the right email. Audited with reason |
| Changed email | An email change in central identity does not move claims. The old email's pending claim is revoked, a new one is issued after the new email is verified |
| Claim uniqueness and competing claims | One `pending` claim per `(businessId, boundEmail)` (partial unique index on `businessId` and lower-cased `boundEmail`), and **at most 3 pending owner claims per business**. Issuing a second claim to the same email atomically supersedes the first (the old secret stops working). Issue is refused if current Owners plus pending claims would exceed 3. The 3-Owner cap is re-checked under lock at consumption. **The limit is enforced atomically, never as a count followed by a separate insert:** (1) issue, consume, supersede and expire, **and every change to the Owner count (O3 transfer start and acceptance, owner add, step-down or removal)**, all run in one transaction that first takes, through one shared `lockOrganisation` helper, `SELECT … FROM organisations WHERE id = $1 FOR UPDATE` on the business row (the same lock the last-owner and cap invariants use), so two staff actions for one business are serialised; (2) inside the lock, expired pending claims are first marked `expired`, a same-email pending claim is superseded, then Owners plus pending are counted and a free slot is chosen; (3) as a database-level backstop, `pending_slot` is null-safe. `status` is `NOT NULL`, and the constraint is `CHECK ((status = 'pending' AND pending_slot IS NOT NULL AND pending_slot BETWEEN 1 AND 3) OR (status <> 'pending' AND pending_slot IS NULL))`. The explicit `IS NOT NULL` is required because PostgreSQL accepts a `CHECK` whose result is NULL (unknown), so `pending_slot BETWEEN 1 AND 3` alone would let a pending row with a NULL slot through. The constraint requires a slot in 1 to 3 whenever the claim is pending and no slot once it is not, and a partial unique index on `(businessId, pending_slot) WHERE status = 'pending'` allows each slot once per business. The slot is cleared in the same statement that moves a claim out of `pending`. A fourth pending claim, or a pending claim without a slot, therefore cannot exist even if the lock were bypassed. The combined Owners plus pending claims limit of 3 depends on the lock; the slot constraint alone caps pending claims at 3. Lock-timeout or unique-violation outcomes return "limit reached", not a server error. The unique `(businessId, userId)` membership rule, the verified-email requirement and atomic consumption (`UPDATE … WHERE status='pending'`) are unchanged. Two claims for different emails are independent: each is consumed by its own owner; a claim whose cap is reached sees "owner limit reached" |
| Ownership reissue after consumption | Not a claim: an **owner transfer** (current owner or staff with audit, new owner accepts, two-party). Old owner becomes Admin unless removed |
| Duplicate safety | Claim consumption never creates an organisation; only adds a membership. Create-organisation is idempotent on `businessId` |
| Abuse | Rate-limited issue and consume; claim links never carry the secret in the URL alone (verified email is the proof) |

## 3. Role mapping (central roles never grant sensitive access)
Principle: a central role grants **eligibility and a default least-privilege product role**, never Caterly's sensitive keys. Sensitive keys (`menuPrices … commercialDocuments`, `src/lib/auth/permissions.ts`) are granted only inside Caterly through `RolePermissionOverride` by a Caterly owner.
| Central role | Caterly effect on first link | Sensitive keys | Notes |
|---|---|---|---|
| Owner | Caterly `owner` **only** through business creation (O1), a consumed claim (O2/O4) or an accepted owner transfer (O3, two-party) | Owner preset includes them, by design | A role edit in central never promotes someone to Caterly owner |
| Admin | Membership in central org only; **no Caterly access until a Caterly role is assigned** | None | Admin can invite and manage central members and products |
| Manager | Eligible; default Caterly role `staff` (least privilege) | None | Caterly owner/manager may raise to `manager` or a department role in the existing Team UI |
| Member | Eligible; default Caterly role `staff` | None | Same |
| Not a central member | No access | None | Removal revokes (section 4) |
Rule: the mapping table is code plus tests; any role not listed maps to "no access". Tests assert no central role ever yields a non-empty sensitive set.

## 4. Permission synchronisation (do not trust ID-token claims alone)
Tokens only prove identity at login. Authorisation is re-checked server-side on every request against Caterly's local `Member` row, and local rows are kept current by three layers:
| Layer | Mechanism | Worst-case staleness |
|---|---|---|
| 1. Push | Platform Core writes a signed `membership.changed` event (outbox, retry, idempotent by event id) for removal, role change, owner transfer, product-access suspend. Caterly applies it to `Member` (disable or role) and deletes that user's sessions for that org | Seconds |
| 2. Pull | Product session carries `membershipVersion`; on each session refresh (≤5 min) Caterly asks Platform Core (signed, cached 60 s) whether the version moved; if so it re-syncs or ends the session | ≤5 min if push was lost |
| 3. Hard stop | Back-channel logout for account disable/compromise; Ops snapshot lock (`evaluateAccess`) for subscription or product suspension; local `Member.disabledAt` check already enforced in `requireActiveOrganization` | Immediate on next request |
| Owner transfer | Two-party, atomic in Platform Core; both products updated by event; old owner's sessions refreshed | Seconds, 5 min worst |
| Product access suspension | Platform Core flips product link status and Ops snapshot version bumps; Caterly shows lock | Existing snapshot rules |
Acceptance: removed user with a live session loses access within the layer-2 bound even if layer 1 is dropped.

## 5. Organisation ownership (unchanged from v2)
Platform Core is canonical, mints `biz_<32hex>`, adopts the existing ids already in catering and Ops (no id change for existing businesses). Ops `Business` becomes a projection; products link by `businessId` over the signed contract; create is idempotent on `businessId`.

## 6. Staging failure scenarios (all must be rehearsed and logged on a real server)
| Scenario | Method | Pass condition |
|---|---|---|
| Migration failure | Ship a release with a failing migration | `deploy.sh` stops before cutover, old slot keeps serving, DB restored or untouched, runbook followed |
| Failed health check | Release whose `/api/health` never answers | Traffic never moves; idle slot torn down |
| Bad release after cutover | Release that boots but breaks login | `rollback.sh` within drain window and again after it |
| Expand-then-contract | Two-release destructive change | Old release still works on the expanded schema |
| Identity provider down | Stop the IdP | Existing product sessions continue; new logins show a clear error; no data loss; recovery without manual fixes; the break-glass procedure in section 10 is drilled, restricted and expires on its own |
| Duplicate and out-of-order webhooks | Replay Razorpay events and Platform Core events | One payment, one membership, monotonic snapshot version |
| Backup/restore | `restore-drill.sh` against staging | Counts match |
| Clock skew / expired signature | Skew 6 minutes | Signed calls rejected, then accepted after fix |
| Mail provider outage | Block ZeptoMail | OTP and invites queue/retry, no duplicate sends |
Staging uses separate hosts, databases, Razorpay test keys and a mail sink; nothing touches production.

## 7. Customer migration mapping (rehearse on staging only)
Source: the existing old-system import (`migration-data/`, `load.mjs`, `last-load.json`; the exact source tables are to be read and documented in step 0 before this plan is final).
| Entity | Mapping rule | Preserved |
|---|---|---|
| Users | Each old user → one central user; `sub` generated once and stored in a `legacy_id ↔ sub` mapping table; email verified or marked for re-verify; password hash imported only if the spike proves it, else a reset email | Name, phone, email, created date |
| Businesses | Each → one organisation; adopt existing `businessId` if one exists in catering/Ops, otherwise mint once and store `legacy_id ↔ businessId` | Name, slug (printed QR/stands depend on it), GST fields |
| Memberships | Old owner → pending owner **claim** (not auto membership) or direct owner membership if the old record proves the user; staff → membership with default `staff` role then restored Caterly role by mapping | Roles, location pinning |
| Subscriptions | Imported into Ops via the existing `ops:import-catering` pattern, keyed by `businessId` | Plan, interval, period end, auto-pay state, invoice counters |
| Entitlements | Regenerated from plans (snapshots), never hand-copied | Limits |
| Operational data | Not moved into identity; stays in Caterly keyed by `businessId` | Everything |
Rules: idempotent upsert, dry run with reconciliation counts, nothing deleted, re-runnable, rollback = drop imported rows by import batch id, no email used as a join key.

## 8. Billing and organisation-id dependency map
| Component | Depends on | Impact of central org ids |
|---|---|---|
| Ops `Business.id` (`biz_`) | Minted by Ops or catering today | Must become "adopted from Platform Core"; ids for existing rows unchanged |
| Ops `Subscription`, `SubscriptionPayment`, invoices, `RazorpayPlan` | `businessId` | None if ids stay |
| Ops snapshots and catering `OpsSnapshot` | `businessId` | None |
| Ops `ownerEmail` as the owner model; `business.provision`; `ops:import-catering` | Email-based owner | Replaced by claims; must not be run against production before claims exist |
| Razorpay subscriptions/webhooks | `businessId` in notes | None |
| Catering `OPS_BILLING` flag | Ops link | Independent of OIDC |
**Recommendation: do the billing cutover AFTER Caterly OIDC integration is proven on staging, and run it once, at go-live, together with the customer import.** Reasons: the cutover and the import both create/link businesses and owners, so doing them before claims exist would rebuild the owner model twice; the 3 customers have no live traffic on the new app yet, so waiting costs nothing; the flag rollback stays valid. Cutover is rehearsed on staging in parallel (steps 1 to 9 of `docs/ops-cutover.md`) so nothing is first-time on go-live day.

## 9. End-to-end acceptance journey (staging, Playwright for each UI step, Vitest for logic). Milestone column: M1 identity + Caterly go-live, M2 commerce, M3 ecosystem (see section 13)
| # | Step | Evidence |
|---|---|---|
| 1 | Register on Platterly (central), verify email | One central user, stable `sub` |
| 2 | Create business "ABC Catering" | One org with `businessId`; second submit changes nothing |
| 3 | Activate Caterly from Account | Catering linked idempotently for the business; no claim is involved here. A business created in Account (O1) already has its creator as Owner; an existing or migrated business gets its Owners through O2/O4 before activation. One membership per user and business; Caterly onboarding wizard runs unchanged |
| 4 | Log out and in on Caterly | One credential prompt, local Better Auth session, correct permissions, no sensitive access beyond owner preset |
| 5 | Open Store, choose plan, annual, coupon (once built), GST details | Order created |
| 6 | Pay on Razorpay (test) | Server-side verification; webhook signature checked |
| 7 | Replay the webhook | No second payment or subscription |
| 8 | Entitlement activation | Snapshot version bumps; Caterly lock lifts within seconds; invoice PDF with GST |
| 9 | Account shows | Product active, subscription, invoice, payment, renewal date |
| 10 | Open Rivo (stub product) | No second login; Rivo sees entitlement; Caterly data not visible |
| 11 | Remove the user as member | Caterly and Rivo sessions end within the section 4 bound |
| 12 | Failure variants | Failed payment → grace → lock; IdP down; duplicate callbacks (section 6) |
Revision 2 note: steps 5 to 8 are **M2 (Store)** steps. M1 uses its own billing steps B1 to B5 through Caterly's existing `/subscribe` (Part 3 section 11).

## 10. Emergency recovery during an identity-provider outage (break-glass)
Central identity stays the only authority. There is **no local password login** after cutover and none is kept as a second door.
| Topic | Rule |
|---|---|
| Existing sessions | Keep working through an outage. Local sessions renew locally for at most 24 hours without the IdP, then require the IdP |
| New logins | Blocked with a clear message. Sign-up, password set and password change are never available locally |
| Break-glass | Off by default (`IDP_BREAKGLASS`). Only Platterly staff (AJ) can switch it on, in the server environment, never from the UI. It switches itself off after 4 hours and must be renewed deliberately |
| Who can use it | Verified **owners** only, one at a time per business, proved by an email one-time code to their verified address (existing emailOTP), not a password |
| Session limits | 60-minute session, flagged as break-glass, read and operate Orders/Kitchen/Menus only |
| Forbidden while active | Team and role changes, ownership transfer or claims, sensitive-key grants, billing and subscription actions, email or security changes, deleting data |
| Accountability | Every use written to the audit log, emailed to the owner and to staff, shown as a banner to the user |
| End state | When the IdP returns, break-glass sessions are revoked and the flag is off. A post-incident review is recorded. After a stable period the code path is removed (AJ decides when) |

## 11. Revocation under the one-membership-per-product rule (rewritten in Revision 10; replaces "Multi-business sessions")
A user has at most one membership per product (section 3b), so there is no active-business choice inside a product and no switcher.
| Event | Action |
|---|---|
| Removed or disabled in the business | Mark the membership removed or disabled and free the slot in one transaction. The user's session in that product loses access on the next request (the member row is checked on every request). The identity session itself is not deleted, so the same user can still use their other products |
| Authorisation on every request | `requireOrg` and `requirePermission` check the member row of the organisation being accessed, so a stale session cannot touch the business even before the product session is ended |
| Per-business state | Location cookie and similar state cleared for that product |
| User-level revocation (delete all sessions, back-channel logout) | Reserved for user-level events: account disabled, suspected compromise, password reset, "sign out everywhere", IdP-wide incident |
| Caterly `requireActiveOrganization` | The unordered first-membership choice becomes moot once a user has one membership; the change belongs to the Caterly integration (`F8`), not W1 |
| Tests | Vitest: removal frees the slot and the user can then be added elsewhere; removal in one product leaves access to another product intact. Playwright (at integration): a removed member is refused on the next request |
Spike must confirm Better Auth cookie caching is off or short, so a removed member is not served from a stale cached session.

## 12. Ownership, retries and email-change safeguards
| Topic | Rule |
|---|---|
| Multiple owners | Allowed (cap 3). Invariant: a business always has at least one owner; the last owner can neither leave nor be removed. Adding an owner uses the two-party flow (invite as Owner, accepted by a verified email). Ownership actions need fresh authentication (`max_age`) |
| Owner removal | An owner can step down; removing another owner is not allowed from the UI, it goes through the dispute procedure |
| Ownership dispute or lost access | Staff-only procedure: lock ownership changes (`ownership_locked`), evidence checklist (GST certificate, registration, registered phone and email verification, call), 7-day notice to all current owner emails, decision by AJ plus a recorded second reviewer where possible, then a new claim to a verified email. All steps audited; billing and data untouched |
| Event delivery | Platform Core outbox: per product delivery with attempts, exponential backoff (1 min, 5 min, 30 min, 2 h, 12 h, 24 h) for up to 7 days, idempotent by event id, ordered per business by a sequence number (consumers ignore lower numbers) |
| Dead letters | After 7 days the event is parked, staff are alerted, a screen allows replay. The layer-2 membership-version pull and a daily reconciliation (product versus Platform Core) close any gap |
| Email change | Requires fresh authentication, a one-time code to the new address, and a notice to the old address with a cancel link valid for 72 hours. During those 72 hours ownership transfers, claim consumption and billing-contact change are held; pending claims and invitations to the old address are revoked. Email is never an organisation join key, so no business changes; the billing contact updates by `owner.changed`. Staff cannot change an owner's email outside the dispute procedure |

## 13. Milestones: identity go-live first, ecosystem later
| Milestone | Scope | Required tests (all on staging first) | Deliberately not included |
|---|---|---|---|
| **M1: Identity and Caterly go-live** | Platform Core (users, organisations, memberships, claims, outbox), identity service, minimal Account (Profile, My Business, My Products, Security), Caterly on OIDC, Ops billing cutover with Caterly's existing `/subscribe` through the Ops billing API, the 3-customer import | Journey steps 1 to 4 and 11; claim recovery cases; org-scoped revocation; break-glass drill; Caterly regression (existing specs run individually: `kitchenlogin`, `password-reset`, `team-management`, `billing`, `payment-grace`, `menu-approvals`); cutover checklist post-switch checks; migration reconciliation; all section 6 failure scenarios; one stub second product proving SSO and logout | Store, coupons, bundles, add-ons, Rivo, Account subscription and invoice pages |
| **M2: Commerce** | Store routes, plan and billing-frequency choice, coupons, Account Subscriptions/Invoices/Payments pages | Journey steps 5 to 9 and 12 (payment variants); duplicate webhook, failed payment, grace and lock tests; GST invoice checks | Rivo, bundles |
| **M3: Ecosystem** | Rivo integration, bundles, add-ons, workspace | Journey step 10; bundle and add-on entitlement tests; cross-product permission tests | none |
M1 does not wait for M2 or M3. Approval of each milestone's go-live is separate.

## 14. Customer migration: partial failure and recovery (the old system stays live)
| Rule | Detail |
|---|---|
| Unit of work | One customer at a time, each in its own import batch id and transaction group; customers never share a transaction, so one failure cannot affect another |
| Before any apply | Dry run for all 3 with a per-customer report; backups of the target databases (identity, catering, Ops); per-customer **before/after** counts: users, memberships, customers, orders, events, menus, inventory, subscriptions, payments (count and rupee total), invoices (count and last number), plus orphan and duplicate checks |
| Apply | Customer 1 → reconcile → AJ verifies → customer 2 → customer 3. Stop at the first mismatch |
| Partial failure | The failing customer's transaction rolls back to nothing; completed customers stay. The cause is fixed, the dry run repeated, that customer re-run (idempotent upsert, `legacy_id` mapping tables prevent duplicates) |
| Rollback | Per customer, by batch id, only after review and explicit approval of the delete list (destructive). Source rows are never modified. The old system remains the live system |
| Old system | Stays running and authoritative until all 3 customers are verified in the new system and AJ approves. During the window, changes made in the old system are re-extracted and re-applied idempotently, or the old system is frozen for a short agreed period. No traffic or domain switch before that approval |
| Verification | Counts and totals equal, sampled records compared field by field, each owner signs in via the claim flow, invoices and payment history match the old numbers, billing renewal dates preserved |
| Decommission | Separate decision after a stable period; never part of the migration window |

## 15. Permanent release process for the whole Platterly project (set by AJ; not optional)
Three mandatory stages. Local testing is the first release gate. Staging never replaces local testing. This applies to M1 (Identity and Caterly), M2 (Account and Store), M3 (Rivo, bundles, unified workspace) and every future Platterly product and module.

| Stage | Gate | What must happen | Exit condition |
|---|---|---|---|
| **1. Local** | L1 Build | Developed on AJ's machine only: local databases, `*.localhost` hosts, Razorpay test credentials, mail sink | Builds, typechecks, lints |
| | L2 Test | All applicable unit (Vitest), integration, UI and end-to-end (surgical Playwright, rules 7 and 8) tests: user journeys, authentication, permissions, one-membership-per-product enforcement, subscriptions, payments with test credentials, failure scenarios. Fix and repeat | Agreed acceptance criteria pass |
| | L3 AJ review | AJ reviews and tests the complete functionality on the local machine; results in a status table | **AJ's written approval to move to staging** |
| **2. Staging** | S1 Deploy | Only after L3. Real-server deployment, database migrations, backups, rollback, domains, email, external integrations | Deploy and rollback logged |
| | S2 Retest | Critical tests repeated on staging; failure scenarios from section 6 | Results shared |
| | S3 AJ review | AJ reviews staging results | **AJ's written approval to plan production** |
| **3. Production** | P1 Plan | Separate production plan: deploy, migration, rollback, communication, timing | Separate explicit approval |
| | P2 Release | Production deploy, authentication change, billing cutover, customer migration, domain switch | Each one individually approved by AJ |

Rules:
- No stage or gate is skipped, merged or reordered. Staging is for validating deployment, not for finding bugs that local testing should have found; a staging-only defect sends the work back to Stage 1.
- No production authentication change, billing cutover, customer migration or domain switch without explicit approval.
- Each milestone passes all three stages on its own; M2 does not start Stage 2 because M1 did.
- Every module and product added later enters the same process; nothing is exempt.

Per-milestone application:
| Milestone | Stage 1 (local) must show | Stage 2 (staging) must show | Stage 3 |
|---|---|---|---|
| M1 Identity and Caterly | Journey steps 1 to 4 and 11 locally; claim recovery; org-scoped revocation; break-glass drill; Caterly regression specs run individually; cutover and 3-customer import rehearsed on data copies with per-customer reconciliation; stub second product SSO and logout | Same critical tests, real deploy, migration failure, failed health check, rollback, backups and restore, domains, real email, IdP downtime, duplicate webhooks | Separate approval for identity, cutover, migration, domains |
| M2 Account and Store | Journey steps 5 to 9 and 12 locally with Razorpay test credentials; coupons; GST invoices; duplicate and failed payment cases | Same on staging with real domains and email | Separate approval |
| M3 Rivo, bundles, unified workspace | Journey step 10; bundle and add-on entitlements; cross-product permissions | Same on staging | Separate approval |
| Future products and modules | Their own acceptance criteria, written before build | Same | Separate approval |

Post-approval housekeeping (not done in plan mode): record this as rule 9 in `.claude/RULES.md`, in `.claude/CLAUDE.md`, and as a project memory, so it applies to every session. Local needs: the identity service, Platform Core, Account/Store, Ops, Caterly and a stub second product all run locally on distinct ports and hosts, so SSO, logout, claims, retries and outage cases are testable without a server. Section 6 outage and rollback scenarios have local equivalents (stop the identity process, run `deploy/test/test-deploy.sh`, fail a migration on a scratch database) and are repeated on staging at G4.

## Acceptance criteria by stage (apply to every milestone)
| Stage | Criteria |
|---|---|
| Local (L2) | Every journey, permission, one-membership-per-product, subscription, test-credential payment and failure scenario for the milestone passes on AJ's machine; no failing test left unexplained; AJ has used the full experience himself or themselves and approved in writing (L3) |
| Staging (S2) | Same critical tests pass; deployment, migration, backup, rollback, domains, email and external integrations verified on a real server; evidence logged and shared |
| Production (P1/P2) | Separate written approval per action: deployment, authentication change, billing cutover, customer migration, domain switch |

## Dependency sequence (updated; local testing and AJ's approval come before any staging work)
| # | Step | Where | Depends on | Gate |
|---|---|---|---|---|
| 0 | Write audit and mapping docs (also fix stale `docs/ops-contract.md:3`; read old-system source for sections 7 and 14) | Docs only | none | AJ reads |
| 1 | IdP spike (sections 1 and 7 hash test, cookie cache check) | Local, scratch project, dev data copy | Logto dev tenant from AJ | Scored report, AJ chooses |
| 2 | Design sign-off: claims, role map, sync, org ownership, session model, break-glass | Docs | 1 | AJ approval in writing; authorises local implementation only |
| 3 | Platform Core and identity service | Local (G1 to G3) | 2 | Identity tests pass locally, AJ reviews |
| 4 | Caterly as relying party behind a flag (`signUpCaterer` updated); claim flow; org-scoped revocation | Local (G1 to G3) | 3 | Caterly tests pass locally, AJ reviews |
| 5 | Local rehearsal of billing cutover and 3-customer import on copies of data, per section 14 | Local | 4 | Reconciliation OK locally |
| 6 | Staging preparation (server access, environment, mail sink, test keys) can proceed in parallel as documentation and setup only | Staging, no application deploys of new auth | VPS access | Ready checklist |
| 5a | **M1 L3: AJ tests the full M1 experience locally** | Local | 4, 5 | AJ's written approval to go to staging |
| 7 | Staging deploy and rehearsal of M1: deploy, migration, backups, rollback, section 6 failures, domains, email, repeat critical tests | Staging (S1 to S3) | 5a approved, 6 | Results shared, AJ approves planning production |
| 8 | Production plan for M1, then each production action approved separately | Production (P1, P2) | 7 | Explicit approval each |
| 9 | M2: Account pages, Store, coupons: local build and test, AJ local review, then staging, then production | Local first | 8 | M2 acceptance by stage |
| 10 | M3: Rivo, bundles, add-ons, workspace: same three stages | Local first | 9 | M3 acceptance by stage |
| 11+ | Every future product and module: same three stages | Local first | previous milestone | Own acceptance criteria |

## Needed from AJ
Logto Cloud dev tenant (or permission to create a trial one); staging server access; the old system's export location and a read of it; written approval of step 3 before any build.

---
# PART 2: MASTER ROADMAP (chunks, groups, phases) FOR REVIEW. Nothing here is started.

> **REVISION 2 NOTICE:** Part 3 (at the end of this file) supersedes this Part 2 wherever they differ: the chunk overview, decision handling (D1 to D12), sections B (dependency matrix), C (waves), D (acceptance), E (risk register), the phases listed in Part 3 section 6, and the M1/M2 journey split. All other Part 2 phases stand unchanged. Where a Part 2 dependency conflicts with Part 3, Part 3 wins.

Part 1 (sections 1 to 15 above) is the architecture. This part breaks it into executable work. M1, M2 and M3 scope is unchanged from v2.1; the three places where I had to interpret scope are listed in section E under "Scope notes" for AJ's approval.

## Conventions
- Chunks are `F0` to `F20` (prefix F = Foundation, to avoid clashing with the existing catering Chunks 1 to 25). Groups `Fn.m`; phases `Fn.m.k`.
- **Every phase** passes the Part 1, section 15 (Permanent release process): local build, local test, AJ's written local approval, then staging, then separate production approval. Not repeated per phase.
- **Standard test baseline (T-STD) for every phase:** Vitest for logic; targeted Playwright only for UI phases (never the full suite, rules 7 and 8); a cross-organisation isolation test wherever data is touched; real cross-app calls between locally running apps, not mocks, for any integration; `npm run lint`, `typecheck`, `check:migrations` clean. Cells below list only what is **extra**.
- **Complexity / uncertainty (C/U):** C = S, M, L, XL; U = L, M, H.
- Code references were checked against the repo during the audit.
- Platform runtime proposed: one new app `apps/platform` (one deployment, hosts `auth.`, `account.`, `store.` routed by host like `src/lib/routing/hosts.ts`), own database `platterly_platform`, one shared package `packages/platform-contract`. No new microservices. Local ports (to be confirmed free): platform 3300, stub product 3500; existing catering 3000, site 3100, Ops 3200.

## A. Master roadmap

### Chunk overview
| Chunk | Name | Milestone | Groups | Why it exists |
|---|---|---|---|---|
| F0 | Documentation and decisions | Pre-M1 | 1 | Audit record, old-system mapping, decision closure |
| F1 | Local platform environment | M1 | 3 | App scaffold, database, contract package, staging preparation (setup only) |
| F2 | Identity provider spike | Pre-M1 | 1 | Chooses the identity provider on evidence |
| F3 | Platform Core | M1 | 3 | Users, organisations, memberships, audit, outbox |
| F4 | Identity service | M1 | 3 | Registration, login, OIDC, logout, sessions |
| F5 | Claims, invitations, ownership | M1 | 3 | Joining and owning a business safely |
| F6 | Product links, sync, client library | M1 | 3 | Connect products without sharing databases |
| F7 | Account portal (identity side) | M1 | 3 | Profile, security, businesses, products |
| F8 | Caterly integration | M1 | 4 | Caterly consumes central identity, keeps its permissions |
| F9 | Ops alignment and billing cutover | M1 | 2 | Ops follows central organisations; cutover rehearsed |
| F10 | Migration and operational tooling | M1 | 2 | Customer migration tooling, deploy, monitoring, runbooks |
| F11 | M1 verification and release | M1 | 4 | Local acceptance, AJ review, staging, production plan |
| F12 | Ops commerce extension | M2 | 4 | Customer-facing billing API, orders, coupons, plan changes |
| F13 | Account commerce pages | M2 | 3 | Subscriptions, invoices, payments |
| F14 | Store | M2 | 3 | Catalogue, checkout, confirmation, site links |
| F15 | M2 verification and release | M2 | 2 | Three-stage gates for M2 |
| F16 | Ops multi-product readiness | M3 | 2 | Remove catering hard-codes, subscription items |
| F17 | Rivo integration | M3 | 2 | Second real product on the same contracts |
| F18 | Bundles and add-ons | M3 | 3 | Multi-product commerce |
| F19 | Unified workspace | M3 | 3 | Product summaries, switcher, cross-product views |
| F20 | M3 verification and release | M3 | 2 | Three-stage gates for M3 |
21 chunks, 56 groups.

### F0 Documentation and decisions (Pre-M1)
**F0.1 Audit, mapping and decisions**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F0.1.1** Audit record. In: write the Caterly audit into `docs/platform-audit.md`; fix stale `docs/ops-contract.md:3`. Out: any code | none | Write from verified findings: Better Auth config, models, tenant resolution, onboarding, cookies, hosts, deploy, e2e coupling | none | none | none | Links resolve | AJ accepts | S/L |
| **F0.1.2** Old-system mapping. In: read `migration-data/`, `load.mjs`, `last-load.json` and the 3 customers' source records | none | List entities, ids, counts and quirks; write the mapping spec for Part 1 sections 7 and 14 | none | none | Treat export as untrusted data | none | Mapping spec reviewed by AJ | M/H |
| **F0.1.3** Decision closure. In: decisions D1 to D12 in section E | F0.1.1 | Put each to AJ with a recommendation | none | none | none | none | Blocking decisions answered | S/M |

### F1 Local platform environment (M1)
**F1.1 Platform app scaffold**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F1.1.1** App shell. In: `apps/platform`, host routing for auth/account/store, `/api/health`. Out: any feature | F0.1.3 | Scaffold like `apps/ops`; host kinds (pattern `hosts.ts`, `proxy.ts`); trusted origins | none | Health only | Unknown host 404; host-only cookies (no cross-subdomain) | Host routing Vitest | App boots with 3 hosts | M/L |
| **F1.1.2** Platform database. In: `platterly_platform` DB, Prisma 7, migration guard. Out: tables | F1.1.1 | Create DB and role locally; guard script covers the new app | empty baseline | none | Separate DB role | Migrate from empty; guard blocks risky SQL | Migrations apply clean | S/L |
| **F1.1.3** Local tooling. In: start-all script, mail sink, Razorpay test keys, seed script | F1.1.1 | One command starts catering, Ops, site, platform, later stub; mail goes to a local sink | none | none | Test keys only, never production | Smoke: all health endpoints | All apps up together | S/L |

**F1.2 Shared contract package**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F1.2.1** `packages/platform-contract`. In: schemas for events, claims, product-link commands, ID-token claims, sequence numbers; reuse signing from `packages/contract` (route-bound HMAC, 300 s window). Out: product code | F1.1.1 | zod schemas; version field; reuse `signing.ts` | none | Schemas only | Signature, replay window | Round-trip, tamper, replay, old-version tests | Package builds, tests green | M/M |

**F1.3 Staging preparation (setup only, no new-auth deploy)**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F1.3.1** Staging requirements and runbook | F0.1.3 | Servers, hosts, DB, secrets, mail sink, Razorpay test keys, backup target | none | none | Secrets handling | none | Checklist signed by AJ | S/M (needs AJ) |
| **F1.3.2** CI for platform app and package | F1.1.2 | lint, typecheck, test, build, migration guard | none | none | No secrets in CI | CI run on a branch (no push without approval) | Green locally and in CI when approved | S/L |

### F2 Identity provider spike (Pre-M1, scratch code only)
**F2.1 Evidence**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F2.1.1** Package and feature check. In: `better-auth` ≥1.7.15 plus `@better-auth/oauth-provider` in a scratch project outside the repo | F0.1.3 | Run the Part 1 section 1 feature checklist | scratch DB | Scratch | Never uses real credentials | Checklist evidence | Table filled with pass/fail | M/H |
| **F2.1.2** Passwords and ids. In: dev `user`/`account` copy; scrypt hash verification; `sub` = existing `User.id`; Logto import | F2.1.1 | Verify existing hashes; try Logto import | scratch copy | none | Copy only, deleted after | Login with imported users | Answer: hashes work / need reset | M/H |
| **F2.1.3** SSO, logout, expiry, cookie cache, token validation across two local hosts | F2.1.1 | Use `generic-oauth` client in a scratch app | scratch | none | Token confusion cases | Wrong iss/aud/exp/nonce rejected; logout ends both; stale cached session check | Behaviours documented | L/H |
| **F2.1.4** Logto Cloud comparison. In: same tests, plus cost, India residency, branding, MFA, admin console | F2.1.2, F2.1.3, Logto tenant from AJ | Repeat tests | none | none | Dev tenant only | Same | Scored table | M/M |
| **F2.1.5** Report and recommendation | F2.1.4 | Write report, delete scratch | none | none | none | none | AJ chooses provider (D1) | S/L |

### F3 Platform Core (M1)
**F3.1 Users and identity link** (shape depends on D1)
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F3.1.1** User model. In: `users`, `user_identities`, `legacy_mappings` | F1.1.2, D1 | Stable global id; email unique case-insensitive; legacy id ↔ `sub` table | the three tables | none | Email never a join key | Unique-constraint cases | Migration and tests pass | M/M |
| **F3.1.2** Identity-link service. `findOrCreateBySubject` idempotent | F3.1.1 | Service interface, no direct table access from other modules | none | internal | none | Concurrent calls create one user | Idempotent under concurrency | S/M |

**F3.2 Organisations, memberships, ownership** (planned together)
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F3.2.1** Schema. `organisations` (id = `biz_<32hex>`), `organisation_members` (central role, status, `membership_version`) | F3.1.1 | Partial unique indexes; adopt-existing-id import mode | 2 tables | none | Org isolation by construction | Constraint tests | Migration green | L/M |
| **F3.2.2** Services. Idempotent create on `businessId`; add/remove/change role; last-owner invariant; version bump; status | F3.2.1 | Row-locked transactions | none | internal service | Last owner cannot leave | Double submit, concurrency, invariant | One org per `businessId` under race | L/M |
| **F3.2.3** Authorisation layer. Server-side central-role checks | F3.2.2 | Central roles Owner/Admin/Manager/Member | none | internal | Cross-org denial | Isolation suite (pattern `src/lib/security/__tests__`) | Isolation suite green | M/L |

**F3.3 Audit and outbox**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F3.3.1** Audit log (pattern `src/lib/audit/audit.ts`) | F3.2.2 | Actor, action, subject, before/after | `audit_logs` | none | No secrets logged | Content tests | Every state change audited | S/L |
| **F3.3.2** Outbox. Per-business sequence, written in the same transaction as the change; delivery worker on a cron endpoint | F3.2.2, F1.2.1 | Backoff 1 min, 5 min, 30 min, 2 h, 12 h, 24 h for 7 days; dead-letter state | `outbox_events` | `/api/cron` | Signed delivery | Retry, ordering, duplicate, dead-letter | Events delivered once-effectively | L/M |

### F4 Identity service (M1; shape depends on D1)
**F4.1 Account lifecycle**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F4.1.1** Registration and email verification (OTP 10 min, 5 tries, 55 s resend as in `auth.ts`) | F3.1.2, F1.1.3 | Auth-host pages in the Platterly design system (rule 6 check first) | per D1 | auth host UI | Enumeration-safe messages, rate limits | Playwright register and verify | New user verified | M/M |
| **F4.1.2** Login, reset, recovery, email change with safeguards (fresh auth, cancel link 72 h, holds) | F4.1.1 | As Part 1 section 12 | per D1 | UI | Hold on ownership actions | Hold and cancel cases | Reset invalidates other sessions | M/M |
| **F4.1.3** Existing-user path (hash accepted or lazy reset, per F2.1.2) | F4.1.1, F2.1.5 | Import tooling for dev copy | legacy map | none | No password logging | Imported user logs in | Dev users migrate on copy | M/H |

**F4.2 OIDC provider**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F4.2.1** Provider and client registry. Clients: catering, account, store, stub. Ops staff login stays separate | F4.1.1 | PKCE mandatory, exact redirect URIs per environment, first-party skip-consent, JWKS rotation | clients | discovery, authorize, token | Open redirect, PKCE downgrade | Wrong redirect and missing PKCE rejected | Discovery valid | L/H |
| **F4.2.2** Token and claims. Minimal claims: `sub`, email, verified, name, `membership_version`. Memberships come from the signed API, not from the token | F4.2.1, F1.2.1 | Per Part 1 section 4 | none | userinfo | iss/aud/exp/nonce | Confusion, replay | Validation matrix green | M/M |
| **F4.2.3** Logout. RP-initiated plus back-channel to registered clients | F4.2.1 | Delivery with retry | client endpoints | UI | Signed logout tokens | Logout one, both end | Both sessions end in window | M/H |

**F4.3 Sessions and security**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F4.3.1** Session list, revoke, sign out everywhere (user-level revoke only) | F4.2.3 | IdP session longer than product session | sessions | UI backend | Own-session only | Revoke one/all | Works | M/L |
| **F4.3.2** Hardening. Rate limits, brute force, CSRF, host-only Secure HttpOnly SameSite cookies (as `auth.ts:41`), auth-event audit | F4.2.1 | Config and tests | none | none | Core | Brute force locks, cookie flags | Checklist passes | M/M |

### F5 Claims, invitations, ownership (M1)
**F5.1 Claims**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F5.1.1** Lifecycle. issue, consume, expire, revoke, supersede (Part 1 section 2) | F3.2.2, F4.1.1 | One pending claim per `(businessId, boundEmail)` (partial unique), max 3 pending owner claims per business, 3-Owner cap re-checked at consumption; consume by verified email in one transaction | `organisation_claims` including `pending_slot`, `status NOT NULL` and the null-safe `CHECK` (`status = 'pending' AND pending_slot IS NOT NULL AND pending_slot BETWEEN 1 AND 3`, or `status <> 'pending' AND pending_slot IS NULL`) and the partial unique index `(businessId, pending_slot) WHERE status='pending'` | internal | Email proof only; issuance under the business-row lock | Competing, replay, expired, wrong email, double submit, concurrency; **two legitimate owners claim the same business independently; duplicate claim for the same email supersedes the first; fourth claim refused and the 3-Owner limit holds under concurrent consumption; concurrency test for issuance (below)** | No duplicate org or membership | L/M |
| **F5.1.2** Recovery operations. Re-issue, revoke, fix wrong email, notifications | F5.1.1 | Staff tooling | none | staff UI | Staff-only, audited | Each recovery path | All cases recover | M/L |

**F5.2 Central invitations**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F5.2.1** Invitations (Revision 10: refused at send and at accept for an identity that already has a slot for the product; one pending per organisation and `lower(email)`). 48 h; secret token separate from the id (an improvement on Caterly's id-only link); accept needs verified matching email | F3.2.2, F4.1.1 | Create, resend, accept, revoke | `organisation_invitations` | accept page | Token hashing, expiry | Expired, wrong account, reuse | Accept creates one membership | M/M |
| **F5.2.2** Product-role hint. Suggested product role carried, non-binding | F5.2.1 | Stored, handed to the product at link time | column | none | Cannot carry sensitive keys | Hint ignored for sensitive | Hint never grants more than defaults | S/L |

**F5.3 Ownership transfer, multiple owners, disputes**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F5.3.1** Owner add and transfer (Revision 10: target must hold no slot for the product; checked at start and acceptance) (two-party, cap 3, last-owner invariant, fresh auth) | F5.1.1 | Flows | `ownership_transfers` | UI later (F7) | `max_age` | Cap, invariant, abandoned transfer | Works under race | M/M |
| **F5.3.2** Dispute tooling. `ownership_locked`, evidence record, 7-day notices | F5.3.1 | Staff procedure with audit | columns | staff UI | Dual-control where possible | Lock blocks changes | Procedure runnable | M/M |
| **F5.3.3** Email-change interplay. 72 h hold; revoke old-email claims and invitations | F4.1.2, F5.1.1 | Hooks | none | none | Holds enforced | Hold, cancel | Cases pass | S/M |

### F6 Product links, sync, client library (M1)
**F6.1 Registry and links**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F6.1.1** Product registry and links. Product key list is authoritative in Ops (D7); Platform Core holds URL and per-direction secrets (encrypted like Ops `Product`) | F3.2.1, F1.2.1 | `products`, `organisation_products` (status) | 2 tables | internal | Secrets encrypted, rotation | Rotation | Seeded: catering, stub | M/M |
| **F6.1.2** Activation command. Platform Core asks a product to link `businessId` (idempotent, adopt id, create no users) | F6.1.1 | Product-side receiver in F8.2 | link status | signed POST | Signature | Repeat returns the same record | Idempotent | M/M |

**F6.2 Synchronisation**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F6.2.1** Event publication. `membership.changed`, `organisation.status`, `owner.changed` with per-business sequence | F3.3.2, F6.1.2 | Publish through the outbox | none | signed POST | Signed, replay-safe | Out-of-order and duplicate | Consumers apply once, in order | M/M |
| **F6.2.2** Pull API and reconciliation. Signed `GET` of membership at a version; daily comparison | F6.2.1 | Layer 2 of Part 1 section 4 | none | signed GET | Per-product scope | Missed event recovered by pull | Gap closed in test | M/M |
| **F6.2.3** Dead-letter admin and replay | F3.3.2 | Staff screen | none | staff UI | Staff-only | Replay idempotent | Replays safe | S/L |

**F6.3 Client library, role mapping, stub product**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F6.3.1** Client helpers in `platform-contract`: token validation (jose), event verify, sequence guard, signed pull | F1.2.1, F4.2.2 | Library | none | library | Constant-time compare | Matrix | Used by two consumers | M/L |
| **F6.3.2** Role-mapping module (Part 1 section 3) as pure functions | F3.2.3 | Table to code | none | none | Sensitive set always empty | Property tests | No central role yields sensitive keys | S/L |
| **F6.3.3** Stub product `apps/stub-product` (second consumer: manifest, OIDC client, receiver) on port 3500 | F6.3.1 | Minimal Next app | own scratch DB | minimal UI | Same checks as Caterly | SSO, logout, sync, revocation | Proves contracts before Caterly changes | M/M |

### F7 Account portal, identity side (M1)
**F7.1 Shell, profile, security**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F7.1.1** Shell. Account as first-party OIDC client; layout and navigation in the design system | F4.2.2, F1.1.1 | Guard, layout | none | UI | Session handling | Playwright login | Signed-in shell | M/L |
| **F7.1.2** My Profile and Security (sessions, recovery, email change UI) | F7.1.1, F4.3.1 | Pages | none | UI | Fresh auth for changes | Playwright | Works | M/L |

**F7.2 Businesses and members**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F7.2.1** My Business (one per product): create, edit, view. No list, no switcher (D15). Create refused when the user already has a membership for the product | F3.2.2, F7.1.1 | Pages | none | UI | Isolation, slot rule | Second-business attempt refused; no leakage | No leakage; rule shown clearly | M/L |
| **F7.2.2** Members, invitations, role change, owner add/transfer UI | F5.2.1, F5.3.1 | Pages | none | UI | Fresh auth | Playwright flows | Works | M/M |

**F7.3 Products**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F7.3.1** My Products: linked products and access status | F6.1.2 | Page | none | UI | No product DB access | Shows link state only | Works | S/L |
| **F7.3.2** Activate Caterly: link, then redirect into Caterly's own onboarding | F6.1.2, F8.2.2 | Flow | none | UI | Idempotent | Double click makes one link | Caterly onboarding starts | M/M |
Note: Account never reads another module's tables; it calls services and signed APIs only.

### F8 Caterly integration (M1; behind flag `PLATFORM_IDENTITY`, off by default)
**F8.1 OIDC relying party and session bridge**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F8.1.1** Relying party via the existing `generic-oauth` plugin; link by `sub` (Account `providerId=platterly`), never by email | F4.2.2, F6.3.1 | Config in `src/lib/auth/auth.ts` | uses existing `account` table; no restructure | callback | PKCE, state, nonce | Existing user sign-in; no duplicate user | Login works behind flag | L/H |
| **F8.1.2** Entry points. Flag on: login and sign-up go to central; forgot-password goes central; flag off: today's behaviour byte-for-byte | F8.1.1 | `src/app/page.tsx`, `/kitchenlogin` redirect | none | UI | Open-redirect guard | `kitchenlogin`, `password-reset` specs both modes | Both modes pass | M/M |
| **F8.1.3** Session lifetime and logout. Silent renewal, 24 h outage extension, back-channel logout endpoint revoking by `sub` | F8.1.1, F4.2.3 | Endpoint and policy | none | endpoint | Signed logout token | Logout from Account ends Caterly | Within window | M/H |

**F8.2 Provisioning and onboarding preserved**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F8.2.1** Auto-provision change. Flag on: the user-create hook (`auto-provision.ts`) creates no organisation; organisations come from central membership | F8.1.1 | Guarded branch | none | none | none | One org per user in all paths | No duplicate org | M/M |
| **F8.2.2** `organisation.link` receiver: idempotent, adopts `businessId`, builds the Organization as `business.provision` does today (`ops-link/commands.ts`), owner membership via sync; onboarding wizard unchanged | F6.1.2, F8.2.1 | Receiver | none | signed POST | Signature | Provision then owner sign-up gives exactly one org | Journey steps 3 and 4 | L/M |
| **F8.2.3** Add unique `Member(userId, organizationId)` (expand-only, duplicate check first, `-- data-safe-approved`) | none | Migration | unique index | none | none | Guard passes, duplicates reported not deleted | Applied on dev copy | S/M |

**F8.3 Permissions and revocation**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F8.3.1** Membership consumer. Events plus pull on session refresh (≤5 min); new members get `staff`; sensitive keys never from central | F6.2.2, F6.3.2 | Apply to `Member` | none | receiver | Matrix | Removal, role change, transfer, suspension | Staleness bound met | L/M |
| ~~**F8.3.2**~~ **Removed in Revision 10 (D15).** There is no organisation switcher and no multi-business session logic. Revocation for a single membership is covered in section 11 and `F8.3.1` | | | | | | | | |
| **F8.3.3** Team page uses central invitations when flag on; product role set after accept; owner only via claim or transfer | F5.2.1, F8.3.1 | Actions | none | UI | No self-promotion | `team-management` spec | Works | M/M |

**F8.4 Protection and fallback**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F8.4.1** Break-glass (Part 1 section 10) | F8.1.3 | Flag, 4 h expiry, owner email code, restricted session, audit and banner | audit only | UI | Restrictions enforced | IdP stopped drill | Drill passes | M/M |
| **F8.4.2** Test helper and regression. `signUpCaterer` (`e2e/auth-helpers.ts:39`) supports both modes; Caterly specs run individually: `kitchenlogin`, `password-reset`, `logged-out-access`, `navigation`, `push-prompt`, `team-management`, `billing`, `payment-grace`, `subscription-plan-button`, `menu-approvals` | F8.1.2 | Helper | none | none | none | As listed | All pass in both modes | M/L |
| **F8.4.3** Rollback proof. Unsetting the flag restores today's login; no table was restructured | F8.4.2 | Verification | none | none | none | Flag off passes all | Documented evidence | S/L |

### F9 Ops alignment and billing cutover (M1)
**F9.1 Ops follows the central organisation**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F9.1.1** Ops `Business` becomes a projection of the central organisation; staff "New business" calls Platform Core; `ownerEmail` becomes the billing contact via `owner.changed` | F6.2.1 | Receiver and staff flow change | small additive columns | signed | Signed | Duplicate event, order | Ops never mints an id | L/M |
| **F9.1.2** Provision and claim path replaces email-matched ownership | F5.1.1, F8.2.2 | Wire `business.provision` through Platform Core | none | signed | Claim proof | Provision then sign-up gives one org (the audited gap) | Gap closed | M/M |
| **F9.1.3** `ops:import-catering` adopt mode (central ids, dry run kept) | F9.1.1 | Script change | none | CLI | Reads only | Dry-run reconciliation | All lines OK | M/M |

**F9.2 Cutover rehearsal (local)**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F9.2.1** Run `docs/ops-cutover.md` steps 1 to 14 locally with Razorpay test keys and the mail sink | F9.1.3, F8.4.2 | Rehearse | none | none | Test keys | `billing`, `payment-grace`, `subscription-plan-button` specs, real Ops | Post-switch checks pass | M/M |
| **F9.2.2** Cutover with identity: new organisation via Account gets its trial in Ops and snapshot in Caterly; payment lifts lock; duplicate webhook | F9.2.1, F7.3.2 | Integration tests | none | none | Webhook signature | Cross-app, no mocks | Journey steps 5 to 8 on Caterly's existing `/subscribe` | M/M |

### F10 Migration and operational tooling (M1)
**F10.1 Customer migration tooling**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F10.1.1** Mapping and loader. Users, organisations, owner claims, Ops import for subscriptions; legacy ids kept | F0.1.2, F5.1.1, F9.1.3 | Scripts | `legacy_mappings` | CLI | Source read-only | Idempotent re-run | Rerun changes nothing | L/H |
| **F10.1.2** Dry run and per-customer reconciliation: before/after counts, rupee totals, last invoice number, orphans | F10.1.1 | Reports | none | CLI | none | Seeded mismatches detected | Report per customer | M/M |
| **F10.1.3** Failure recovery. One batch per customer, batch-id rollback with reviewed delete list, resume | F10.1.2 | Tooling | batch id column | CLI | Delete needs approval | Forced failure on customer 2 | Customer 1 unaffected | M/M |
| **F10.1.4** Local rehearsal of all 3 customers on data copies | F10.1.3 | Run | copies | none | Copies only | Verification list | AJ reviews report | M/H |

**F10.2 Operational tooling**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F10.2.1** Deploy assets for the platform app: systemd unit, Nginx blocks, env example, blue/green slot, backups and restore drill including the platform DB (extending `deploy/`) | F1.1.2 | Scripts | none | none | Secrets | `deploy/test/test-deploy.sh` extended | Passes locally | M/M |
| **F10.2.2** Monitoring: Sentry, health, outbox lag, auth anomaly alerts | F3.3.2, F4.3.2 | Config | none | none | No PII in events | Alert fires on forced lag | Alerts visible | M/L |
| **F10.2.3** Runbooks: break-glass, IdP outage, claim recovery, dispute, rollback | F8.4.1, F5.3.2 | Docs | none | none | none | Walkthrough | AJ reads | S/L |

### F11 M1 verification and release
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F11.1.1** Local acceptance. Journey steps 1 to 4 and 11; claim cases; org-scoped revocation; break-glass; stub-product SSO and logout; cutover checks | F8, F9, F10 | Run and fix | Part 1 section 13 M1 list | All pass | L/M |
| **F11.1.2** Security review: redirect URIs, token confusion, isolation, rate limits, secrets | F11.1.1 | Checklist | Negative tests | No open high findings | M/M |
| **F11.1.3** Documentation updated (architecture, contracts, runbooks, `.claude` status) | F11.1.1 | Docs | Link check | Current | S/L |
| **F11.2.1** AJ local review (L3): demo script and checklist | F11.1.x | AJ tests locally | AJ's | **AJ's written approval** | gate |
| **F11.3.1** Staging deploy and rehearsal (S1 to S3): deploy, migrations, backups, rollback, Part 1 section 6 failures, domains, email | F11.2.1, F1.3.1 | Run | Critical tests repeated | Evidence and **AJ's approval** | L/H |
| **F11.4.1** Production plan (P1) | F11.3.1 | Plan doc | none | **Separate approval**; each P2 action approved on its own | gate |

### F12 Ops commerce extension (M2)
**F12.1 Customer-facing billing API**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F12.1.1** Read API for Account and Store: catalogue, subscriptions, invoices, payments per `businessId`. Extends the existing product→Ops billing API (contract section 8.1) | F11 | Signed endpoints, user-scoped via Platform Core membership | none | signed | Caller must be member with billing right | Non-member denied | Account reads without touching Ops tables | L/M |
| **F12.1.2** Billing rights: which central roles may buy or view invoices | F6.3.2 | Rule and tests | none | none | Least privilege | Matrix | Defined | S/M |

**F12.2 Orders, billing customers, status model**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F12.2.1** Billing customer and order records (GST details, buyer snapshot already on `SubscriptionPayment`) | F12.1.1 | Additive Ops migration | `billing_customers`, `orders` | internal | Idempotent order create | Duplicate checkout | One order per attempt | L/M |
| **F12.2.2** Status model. Decide `PAST_DUE` (defined in the enum, never set today) and map to Account wording | F12.2.1 | Code and docs | maybe enum use | none | none | Status transitions | Documented, tested | M/M |
| **F12.2.3** Entitlement versus subscription: design `subscription_items` shape now so bundles do not force a later rewrite; build only what M2 needs | F12.2.1 | Design doc | none (shape only) | none | none | Review | AJ approves shape | M/H |

**F12.3 Promotions** (coupon rules are undecided, D9)
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F12.3.1** Coupon model and validation | F12.2.1, D9 | Percent, fixed, product, validity, usage limit | `coupons`, `coupon_redemptions` | internal | Server-side only, atomic redemption | Double redemption, expiry | Price correct with GST | M/M |
| **F12.3.2** Ops staff UI for coupons | F12.3.1 | Ops screens | none | UI | Staff-only | Playwright | Works | M/L |

**F12.4 Plan changes and payment methods**
| Phase | Depends | Tasks | DB | API · UI | Security | Extra tests | Done when | C/U |
|---|---|---|---|---|---|---|---|---|
| **F12.4.1** Upgrade, downgrade, cancellation, reactivation, proration rules | F12.2.2 | Extend existing billing | additive | signed | Idempotent | Each scenario | Entitlements follow | L/H |
| **F12.4.2** Refunds and payment-method update (Razorpay autopay is a Razorpay Subscription with status enum only today) | F12.4.1 | Extend webhook handling | additive | signed | Webhook signature | Refund, failed renewal | Reconciles | L/H |

### F13 Account commerce pages (M2)
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F13.1.1** Subscriptions page: active plans, frequency, renewal, change, cancel | F12.4.1 | UI over F12.1.1 | Playwright with Razorpay test credentials | Journey step 9 | M/M |
| **F13.2.1** Invoices and Payments pages: history, GST PDF download, failed payments, refunds | F12.4.2 | UI | PDF content check | Matches Ops invoice | M/M |
| **F13.3.1** Overview: summary, renewals, active products | F13.1.1 | UI | Playwright | Accurate | S/L |

### F14 Store (M2)
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F14.1.1** Catalogue and plan selection from Ops plans (multi-product ready); monthly or annual | F12.1.1 | Store routes in `apps/platform` under `/store`, own layout, no Account table access | Playwright | Plans match Ops | M/L |
| **F14.2.1** Checkout: sign-in, business choice, billing and GST details, coupon, Razorpay | F12.3.1, F12.2.1 | Reuse Ops checkout and verification | Server verification, tamper, duplicate callback | Journey steps 5 to 7 | L/M |
| **F14.2.2** Order confirmation and return to the product; entitlement activation visible | F14.2.1 | Page and redirect | Journey step 8 | Lock lifts, invoice issued | M/M |
| **F14.3.1** Marketing-site links (`apps/site` CTAs and pricing) point to the Store/Account where intended | F14.1.1 | Content change via Ops-fed site | Site tests, `check:links` | Links valid | S/M (see scope note S3) |

### F15 M2 verification and release
| Phase | Tasks | Done when |
|---|---|---|
| **F15.1.1** Local acceptance: journey steps 5 to 9 and 12, coupons, GST invoices, failure cases, Caterly regression | Run and fix | All pass |
| **F15.1.2** AJ local review; staging S1 to S3; production plan P1 and separate P2 approvals | Part 1, section 15 (Permanent release process) | Approvals recorded |

### F16 Ops multi-product readiness (M3)
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F16.1.1** Remove catering hard-codes: `apps/ops/src/modules/plans/plans.ts:91`, `site-content/site-content.ts:368`, notice limits, usage note | F15 | Generalise by manifest | Two-product fixtures | Stub plans show on site | M/L |
| **F16.2.1** Subscription items and entitlement separation implemented per F12.2.3 | F12.2.3 | Additive migration | Bundle-ready invariants | Existing subscriptions unchanged | L/H |

### F17 Rivo integration (M3; Rivo is outside this repo, its stack is undecided, D11)
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F17.1.1** Rivo adopts contracts: OIDC client, `platform-contract` client, manifest, link receiver, membership sync, entitlement snapshot | F6.3.1, F16.1.1 | Integration work in Rivo's repo; use the stub as the reference | Same suite as stub | Rivo passes the product-conformance tests | L/H |
| **F17.2.1** Cross-product SSO and isolation: register on Caterly then Rivo, and the reverse | F17.1.1 | Tests | Journey step 10 | No second login, no data leak | M/M |

### F18 Bundles and add-ons (M3)
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F18.1.1** Bundle catalogue and pricing | F16.2.1, D10 | Ops models and staff UI | Price and GST tests | Bundle priced | L/H |
| **F18.1.2** Bundle purchase and multi-product entitlements | F18.1.1, F14.2.1 | Store and Ops | Two entitlements from one subscription | Both products activate | L/H |
| **F18.2.1** Add-ons: model, purchase, entitlement | F16.2.1 | Ops, Store | Add-on limits | Entitlement changes | M/M |
| **F18.3.1** Bundle upgrade, downgrade and cancellation rules (cancel one product never removes another unless terms say so) | F18.1.2 | Rules and tests | Each rule | Per commercial terms (D10) | L/H |

### F19 Unified workspace (M3)
| Group / phase | Depends | Tasks | Extra tests | Done when | C/U |
|---|---|---|---|---|---|
| **F19.1.1** Product summary contract (manifest extension: widgets, counts) and signed endpoints in Caterly and Rivo | F17.2.1 | Contract and implementation | Contract tests | Summaries returned | M/M |
| **F19.2.1** Workspace UI: overview, product switcher, connected apps | F19.1.1 | `apps/platform` workspace routes | Playwright | Journey works | M/M |
| **F19.3.1** Cross-product permissions: workspace shows only what the user may see per product | F19.1.1, F6.3.2 | Enforcement | Negative tests | No leak | M/M |

### F20 M3 verification and release
Same shape as F15: local acceptance (journey step 10, bundle and add-on entitlements, cross-product permissions), AJ local review, staging, production plan.

## B. Dependency matrix and graph
| Chunk | Hard dependencies | Can overlap with |
|---|---|---|
| F0 | none | F1.1 |
| F1 | F0.1.3 (decisions) | F2 |
| F2 | F0.1.3 | F1, F3.1 schema work that does not depend on D1 |
| F3 | F1; F3.1 needs D1 | F2 tail |
| F4 | F3.1, F2.1.5 | F5.1 schema design |
| F5 | F3, F4.1 | F6.1 |
| F6 | F3, F4.2, F5 | F7.1 shell |
| F7 | F4.2, F5, F6.1 | F8.1 |
| F8 | F4.2, F6 (client library and stub), F5.1 | F9.1 design, F10.2 |
| F9 | F6.2, F8.2 | F10.1 |
| F10 | F5.1, F9.1.3, F0.1.2 | F8, F9 |
| F11 | F7 to F10 | none |
| F12 | F11 approved at L3 (see D12) | F13 UI scaffolding after F12.1 |
| F13, F14 | F12 | each other after F12.1 |
| F15 | F13, F14 | none |
| F16 | F15 | F17 start after F16.1 |
| F17 | F6.3.1, F16.1 | F18 start |
| F18 | F16.2, F14 | F19 |
| F19 | F17 | none |
| F20 | F16 to F19 | none |

**Critical path (M1):** F0.1.3 → F2.1.5 (D1) → F3.1 → F4.1/F4.2 → F5.1 → F6.1/F6.2 → F6.3 (library, stub) → F8.1/F8.2/F8.3 → F9.1/F9.2 → F10.1.4 → F11.
**Parallel workstreams (safe):** (1) F1.1 to F1.3 setup while the spike runs; (2) F3.2/F3.3 (schema, services, outbox) while the spike runs, because they do not depend on D1; (3) F7 UI once F4.2 and F5 contracts are fixed, alongside F8; (4) F10.2 tooling alongside F8 and F9; (5) F12.1 to F12.3 design work alongside F11 staging, with build gated by D12.
**Blocking decisions and external needs:** D1 (provider), Logto tenant, old-system export, staging server access, D7, D8.
**Integration checkpoints (real cross-app tests, no mocks):**
| Checkpoint | After | What is proven |
|---|---|---|
| IC1 | F4.2 | A client app logs in, validates tokens, logs out via the IdP |
| IC2 | F6.3.3 | Stub product: SSO, back-channel logout, membership sync, removal within the bound |
| IC3 | F8.3 | Caterly: same as IC2 with Caterly's permissions and org-scoped revocation |
| IC4 | F9.1.2 | Ops, Platform Core and Caterly agree on one organisation per `businessId` |
| IC5 | F9.2.2 | Account-created organisation gets trial, payment, lock lift end to end |
| IC6 | F10.1.4 | Three customers migrate on copies with reconciliation OK |
| IC7 | F12.1 | Account reads billing data through signed APIs only |
| IC8 | F17.2 | Second real product passes the same conformance tests as the stub |
**Rework risks if sequenced wrongly:**
| Risk | Avoided by |
|---|---|
| Account built before claims, memberships and sync contracts are fixed | F7 after F5 and F6.1 |
| Caterly OIDC before the library and stub prove the contracts | F6.3 before F8 |
| Ops cutover or import before claims replace email-matched ownership | F9.1 before F9.2 and F10.1 |
| Store before Ops billing API, orders and coupons | F12 before F14 |
| Bundles before entitlement/subscription separation is shaped | F12.2.3 design in M2, build F16.2 in M3 |
| Hosts, redirect URIs and cookie model chosen after the IdP is configured | F1.1.1 and F4.2.1 together |
| `PAST_DUE` shown to customers before it is defined | F12.2.2 before F13 |
| Product-registry duplication between Ops and Platform Core | D7 before F6.1 |

## C. Execution sequence (waves)
| Wave | Chunks / groups | Why now |
|---|---|---|
| W0 | F0, F1.1 to F1.3 | Records and environment first; no feature depends on a missing decision |
| W1 | F2 spike, with F3.2 and F3.3 in parallel | Provider choice does not block organisation and outbox work |
| W2 | F3.1, F4.1, F4.2, F4.3 | Identity needs the provider decision |
| W3 | F5, F6.1, F6.2, F6.3 | Claims, links and sync need identity; the stub proves them before Caterly |
| W4 | F7, F8, F10.2 in parallel | Account UI and Caterly integration consume the same contracts; tooling is independent |
| W5 | F9, F10.1 | Ops and migration need claims and Caterly's receiver |
| W6 | F11 | M1 acceptance, AJ review, staging, production plan |
| W7 | F12, then F13 and F14 | M2 starts after M1 L3 approval (D12) |
| W8 | F15 | M2 release gates |
| W9 | F16, F17, F18, F19 | M3 in dependency order |
| W10 | F20 | M3 release gates |

## D. Testing and acceptance
**Phase level:** T-STD plus the extra tests listed per phase.
**Chunk definition of done (applies to every chunk):**
| Requirement | Evidence |
|---|---|
| Implementation complete | Merged locally, no TODOs left in scope |
| Database and API integrations verified | Real cross-app run, not mocks |
| Security and permission checks pass | Isolation suite and chunk's negative tests |
| Automated tests pass | Vitest and targeted Playwright, run individually |
| Existing functionality regression-tested | Caterly specs listed in F8.4.2 plus any the chunk touches; Ops billing specs |
| Documentation updated | Architecture, contract, runbook, `.claude/STATUS.md` |
| Next chunk's dependencies verified | The relevant integration checkpoint (IC1 to IC8) passed |
**Milestone acceptance:** M1 = Part 1 section 13 M1 list plus IC1 to IC6 and F11. M2 = journey steps 5 to 9 and 12 plus IC7. M3 = journey step 10, bundle and add-on entitlement tests, cross-product permissions, IC8. Each passes local (AJ approves), staging (AJ approves), then separate production approval.

## E. Risk and decision register
**Decisions needing AJ**
| ID | Decision | Needed by | My recommendation |
|---|---|---|---|
| D1 | Identity provider (Better Auth provider vs Logto Cloud) | After F2 | Decide on spike evidence |
| D2 | Session policy: product session lifetime, IdP lifetime, outage extension (proposed 24 h) | F4.2 | Keep proposed |
| D3 | Central role names and their Account permissions | F3.2 | **Approved 2026-11-04**: Owner/Admin/Manager/Member; fresh authentication for Owner-only actions |
| D4 | Central business locations: blueprint lists them; Caterly already has Kitchens/locations | F7.2 | **Approved 2026-11-04**: product-owned; Branch, Kitchen and Store stay in their products |
| D5 | Sender domain and templates for auth emails | F4.1 | **Open (AJ, 2026-11-04).** Recommendation unchanged: same ZeptoMail account, distinct sender. Blocks `F4.1.1` only |
| D6 | Seller/GST details on Ops Billing (already open) | F9.2 | Fill before cutover rehearsal |
| D7 | Single source of the product registry (Ops vs Platform Core) | F6.1 | **Approved 2026-11-04**: Ops authoritative; Platform Core caches and refreshes |
| D15 | One membership per user identity per product, all roles, enforced in the database; no switcher (new, Revision 10) | F3.2, F5, F7 | **Approved 2026-11-04** (section 3b) |
| D8 | Platform deployment shape: one Next app for auth, account and store hosts | F1.1 | Yes, one app |
| D9 | Coupon rules (types, stacking, limits) | F12.3 | Percent and fixed, one per order |
| D10 | Bundle and add-on commercial rules | F18 | Decide before M3 |
| D11 | Rivo repo, stack and timeline | F17 | Reuse the stub as the conformance reference |
| D12 | Start M2 build after M1 L3 approval, or only after M1 production | F12 | After M1 L3 approval, local only |
**Scope notes (interpretations I made; please confirm, nothing moved silently)**
| ID | Note |
|---|---|
| S1 | Central invitations (F5.2) are in M1. v2.1's M1 list names claims and Account but not invitations; Caterly's Team page needs a working invite path once login is central |
| ~~S2~~ | **Withdrawn (Revision 10, D15).** No organisation switcher; one membership per product |
| S3 | Marketing-site link changes (F14.3.1) are in M2; in M1 the site keeps pointing at Caterly, which redirects to central login |
| S4 | `subscription_items` is a design-only phase in M2 (F12.2.3); the build stays in M3 |
**Risks**
| Type | Risk | Mitigation |
|---|---|---|
| Technical | Better Auth provider package or a missing feature (back-channel logout, claims) | Spike with pass/fail rule; Logto fallback |
| Technical | `better-auth` upgrade ≥1.7.15 in Caterly and Ops affects existing behaviour | Upgrade as its own tested phase before F8; run the regression list |
| Technical | Session staleness after removal | Three-layer sync and ≤5 min bound |
| Migration | Old-system data is unknown until F0.1.2 | Read first; U=H on F10.1 |
| Migration | Hash incompatibility forces password resets for 3 customers | Planned lazy reset path |
| Security | Open redirect, token confusion, claim takeover | F11.1.2 review, negative tests |
| Security | Break-glass becomes a back door | Owner-only, 4 h expiry, audited, code removed later |
| Operational | One VPS, no staging yet, deploy scripts never run on a real server | F1.3 and F11.3 rehearsals |
| Operational | Two big changes (cutover and identity) in one window | Local rehearsal, separate approvals |
| External | Logto tenant, staging access, old-system export, Rivo timeline | Listed as blockers |

## F. Effort and complexity
| Area | Complexity | Uncertainty | Why |
|---|---|---|---|
| F0, F1, F2 | S to M | M to H (F2) | Spike outcome unknown |
| F3 Platform Core | L | M | Concurrency and invariants |
| F4 Identity | L | H | Depends on D1; logout and token details |
| F5 Claims and ownership | L | M | Many edge cases |
| F6 Links, sync, library | L | M | New contracts |
| F7 Account | M | L | Standard UI over services |
| F8 Caterly integration | XL | H | Protects the existing product; largest regression surface (71 of 77 e2e specs use `signUpCaterer`) |
| F9 Ops alignment and cutover | L | M | Cutover steps exist; ownership model changes |
| F10 Migration and tooling | L | H | Old-system data unknown |
| F11 Release | L | H | First real-server rehearsal |
| F12 Ops commerce | XL | H | Refunds, plan changes, autopay state |
| F13, F14 | M to L | M | UI over Ops APIs; Razorpay flows |
| F16 to F19 | L to XL | H | Bundle rules and Rivo undecided |
Needs most investigation first: F2 (provider), F0.1.2 (old system), F8.1 (session bridge), F12.4 (plan changes and refunds), F18 (bundle rules).

## What approval of this roadmap authorises
Review and correction of this document only. Documentation and the scratch-code spike were already authorised (see Context). After AJ's written approval of the roadmap, the repository work in W0 and W1 becomes authorised (local environment, Member audit, `F6.1.0`, Platform Core data layer), all local. No staging deployment of new code and no production change of any kind.

---
# PART 3: ROADMAP REVISION 2 (responds to AJ's ten review points). Nothing here is started.

Scope, architecture, chunk structure (21 chunks, 56 groups) and milestone intent are unchanged. This revision fixes sequencing and fills gaps. Part 2 phases not mentioned here stand as written.

## 0. Change log
| # | AJ's point | What changed | Why |
|---|---|---|---|
| 1 | Circular decision dependency | `F0.1.3` split into four gated decision phases (Gate A to D, section 2); `F2` now depends only on Gate A | D1 can only follow the spike, so it cannot gate the spike |
| 2 | Theoretical parallelism | Waves rebuilt from phase dependencies (section 9). Platform Core's `users` table is owned by Platform Core in both provider cases, so `F3.1.1`, `F3.2` and `F3.3` do not depend on D1, but they do depend on `F3.1.1 → F3.2.1 → F3.2.2` in order and on provider-independent decisions Gate B-1 | Makes the W1 parallel claim true, and shows what truly waits for D1 |
| 3 | M1 vs M2 payments | M1 billing uses Caterly's existing `/subscribe` through the Ops billing API (journey B1 to B5). Store, checkout, coupons and Account billing pages are M2 only (section 11). `F9.2.2` rewritten | No Store in M1 acceptance |
| 4 | Ownership flows | Four separate flows O1 to O4 (section 3) with new phase `F5.1.0` | Removes ambiguity between create, claim, transfer and migrated owner |
| 5 | Account permissions | Full action × role matrix (section 4), enforced in `F3.2.3` | Central rights now explicit and separate from product permissions |
| 6 | Product registry ownership | One authoritative source per information type (section 5); new `F6.1.0`; `F6.1.1` rewritten | Removes duplicate registries and shared secrets |
| 7 | Release gates | Three completion levels: phase, chunk, milestone release (section 1) | Technical acceptance everywhere, release approvals only at milestone level |
| 8 | Migration acceptance | Fourteen explicit tests M-01 to M-14 (section 12); new `F10.1.5` | Covers owners, staff, one-membership-per-product conflicts (Revision 10), billing, history, deltas, orphans, rollback |
| 9 | Member unique constraint | `F8.2.3` split into audit, report, recovery plan, apply (section 13) | Never silently delete or merge memberships |
| 10 | Return revised roadmap | Sections 6 to 11 and 14 below | As requested |
| extra | Circularity I found while checking | `F6.1.2` listed "receiver in F8.2" while `F8.2.2` depends on `F6.1.2`. Now: `F6.1.2` is sender plus contract, tested against the stub (`F6.3.3`), and Caterly's receiver (`F8.2.2`) consumes it | Second circular dependency |

## 0a. Revision 3 change log (five final corrections; nothing else changed)
| # | Correction | What changed | Where |
|---|---|---|---|
| 1 | Multiple owners | O4, M-01 and IC4 now require **at least one verified Owner, maximum 3**, preserve every legitimate source owner, and keep exactly one organisation per `businessId` | Sections 3, 10, 12 |
| 2 | Invitation expiry | Two explicit types: I1 standard (48 h) and I2 migration staff (14 days), with tests I-01 to I-07 and M-02 updated | New section 3a |
| 3 | Old system status | Section 12 heading corrected: live and authoritative until approval; delta reconciliation or an agreed freeze; read-only only while a freeze is active | Section 12 |
| 4 | Safe write and rollback | Three outcomes (populate, skip, stop and report); rollback deletes only rows unchanged since import with no dependents; modified or used rows are retained and reported | Section 12, M-12, M-14, F10.1.1 |
| 5 | `F6.1.0` | Signing, response signing, separate secret, atomic apply, refresh failure, stale thresholds, deactivation and missing-product handling, base-URL change review, tests | New section 5a, F6.1.0 row, matrix row |

## 0i. Revision 10 change log (2026-11-04; AJ approved Gate B-1 except D5; documentation only, nothing implemented)
| # | Decision / change | Exact change | Where |
|---|---|---|---|
| 1 | **D15 (new): strict one-membership-per-product rule** | One email is one Platterly identity. That identity holds at most **one membership, in any role (Owner, Admin, Manager or Member), per product**. A second kitchen needs a different email. There is no multi-kitchen switcher and no multi-business dashboard. Different products are independent (one Caterly and one Rivo membership are allowed). Enforced in the database, not only in code (section 3b) | New section 3b; D15 row in the register; O1 to O4 and I1/I2 below |
| 2 | S2, `F8.3.2` and multi-business assumptions removed | S2 withdrawn. `F8.3.2` removed (its useful part, a deterministic active-organisation choice, is no longer needed because a user has at most one membership per product). `F7.2.1` becomes "My Business" (one per product, no list-switching). Section 11 rewritten. Test M-03 replaced by a conflict-detection test. Journey and milestone wording that mentioned organisation switching changed | Sections 11, 4 (milestones), `F7.2.1`, risk register S2, M-03, Part 3 scope note |
| 3 | **D3 approved** | Central roles stay Owner, Admin, Manager, Member with the matrix in Part 3 section 4. Every Owner-only action needs fresh authentication (`max_age`) | Section 4; `F3.2.3` |
| 4 | **D4 approved** | Locations are product-owned. Branch, Kitchen and Store stay inside Caterly (and any later product). No central locations table in M1 | Register; `F3.2.1` |
| 5 | **D7 approved** | Ops stays authoritative for the product registry; Platform Core caches and refreshes (section 5 unchanged) | Register; `F6.1.1` |
| 6 | **D13 approved, amended** | O1 to O4 enforce D15. O1 refuses a user who already has a membership for the product; the per-user creation cap is therefore 1 per product (the former open cap value is closed). O2 claim issue (where the email already maps to a user) and consume refuse when that user has a slot for the product. O3 target must be free. I1 and I2 invitations are refused at send time and at accept time for a user with a slot. O4 stays blocked on E2 | Section 3, 3a, 3b |
| 7 | **D5 stays open** | Auth email sender and templates. Blocks only `F4.1.1`, not the data layer | Register |
| 8 | Caterly boundary | No change to Caterly login, kitchen settings, memberships or live operations in W1. The Caterly-side enforcement (a users-per-membership uniqueness and closing the self-service organisation-create route) is part of the Caterly integration (`F8`) and the Member uniqueness work (section 13), a final, separately approved activity | Section 13 note; `F8.2.3` |
| 9 | W1 | Entry conditions, task acceptance and tests updated; `F0.1.4` recorded as partly closed (D5 open; O4 after `F0.1.2`) | W1 row; `F3.1.1` to `F3.3.2`, `F5.1.0`, `F5.1.1`, `F5.2.1`, `F5.3.1` |
| 10 | W1 planning baseline (2026-11-04) | `docs/w1-implementation-plan.md` holds the W1 planning baseline and the clarifications on F8.2.4a test isolation, owner invariants, outbox sequence and product unlinking. Revised the same day: dead-lettered outbox events keep blocking until recovery or an audited resolution (deviates from section 12, which parks them after 7 days); an organisation cannot unlink its last product link; unlink reconciliation via a tombstone. Planning only; no implementation, database operation or approval is implied | `docs/w1-implementation-plan.md` |
Local evidence recorded for D15 (read-only counts on `platterly_dev`, 2026-11-04): 64 users, 0 users with more than one membership, 0 users with more than one owner membership, 0 case-insensitive email duplicates. The 3 migrating customers and any production data are audited separately (`F8.2.3f`, `F8.2.3g`, and E2 for the old system). Authorisation boundaries and local-first release gates are unchanged; nothing here permits implementation.

## 0h. Revision 9 change log (two clarifications; nothing else changed)
| # | Clarification | Exact change | Where |
|---|---|---|---|
| 1 | W0/W1 sequencing | `F8.2.3a` (read-only Member audit, W0) must be successfully completed, with its output produced, before `F8.2.3b` (report, W1) may start. Added to the W1 entry conditions, the `F8.2.3` dependency cell and section 13 step b | W1 row, `F8.2.3a–g` row, section 13 |
| 2 | Better Auth lock verification | The wrapper holds the advisory transaction lock for the full duration of the Better Auth operation (acquired before the call, released after it resolves or rejects, rolled back in `finally`). `F8.2.4` gains a test of two simultaneous invitation acceptances for the same user and organisation through the real `auth.api.acceptInvitation`, on separate real PostgreSQL connections, with the unique index absent: exactly one `Member` row, no server error over 50 runs, lock coverage proven. The eight-way test is kept | Section 13 (invitation row and guard tests), `F8.2.4` row |
Authorisation boundaries and local-first release gates are unchanged; nothing here permits implementation.

## 0g. Revision 8 change log (four final corrections; nothing else changed)
| # | Correction | Exact change | Where |
|---|---|---|---|
| 1 | Authorisation heading | Now reads "applies to Revision 7 and subsequent revisions unless superseded" | Final authorisation heading |
| 2 | Release-gate references | Every reference to "section 15" now reads "Part 1, section 15 (Permanent release process)" (Context, the Part 2 phase note, `F15.1.2`, final authorisation section) | Context, conventions, `F15.1.2`, final section |
| 3 | Member lock convention | While the unique index is absent, every path that creates or updates a `Member` uses one `withMemberLock(userId, organizationId, fn)` advisory-lock helper: onboarding and provisioning, invitation acceptance, Team management, any other found by code search, and the new central paths. New phase `F8.2.4` with guard test and concurrency test; `F8.2.2`, `F8.3.1`, `F8.3.3` depend on it | Section 13, phase rows `F8.2.2` and `F8.2.4`, W4, complexity |
| 4 | Local audit as prerequisite | `F8.2.3` is now seven ordered steps: local audit, report, recovery plan, local resolution and local migration test, AJ's local approval, staging audit and migration, production audit and separately approved migration | Section 13, `F8.2.3` row, W4 |
Authorisation boundaries are unchanged: nothing here permits implementation; repository changes stay unauthorised until AJ's written approval of the roadmap.

## 0f. Revision 7 change log (one correction plus a completeness check; nothing else changed)
| # | Change | Exact change | Where |
|---|---|---|---|
| 1 | `pending_slot` CHECK made truly null-safe | Replaced with `CHECK ((status = 'pending' AND pending_slot IS NOT NULL AND pending_slot BETWEEN 1 AND 3) OR (status <> 'pending' AND pending_slot IS NULL))` and `status NOT NULL`. Reason: PostgreSQL accepts a CHECK that evaluates to NULL, so the earlier form allowed a pending row with a NULL slot. Partial unique index and 1 to 3 range kept. CL-5 now proves PostgreSQL rejects (b) a pending row with a NULL slot (insert and update) and (b2) a NULL status | Part 1 section 2 claim row, `F5.1.1` DB cell, section 0c CL-5, Revision 6 log row |
| 2 | Authorisation wording verified | The final section "What is already authorised, and what approval of this roadmap adds" is present and complete (three rows: already authorised, authorised only after AJ's written approval, not authorised). Context and the Part 2 closing statement say the same. An explicit end marker was added as the last line of the file so completeness is checkable | Context, Part 2 closing statement, final section, end marker |

## 0e. Revision 6 change log (three refinements; nothing else changed)
| # | Refinement | Exact change | Where |
|---|---|---|---|
| 1 | Null-safe `pending_slot` | `CHECK` added (superseded by the corrected form in Revision 7, section 0f); 1 to 3 range and partial unique index kept. CL-5 extended: raw pending insert without a slot (and other invalid slot states) must be rejected by PostgreSQL | Part 1 section 2 (claim uniqueness row), `F5.1.1` DB cell, section 0c CL-5 |
| 2 | O3 uses the same lock | O3 start and acceptance take the shared `lockOrganisation` helper before checking or changing the Owner count and re-check Owners plus pending ≤ 3. Every Owner-count change uses it. Tests CL-7 (transfer racing issuance) and CL-8 (transfer racing consumption) added | Part 1 section 2, O3 row, `F3.2.2` row, `F5.3.1` row, section 0c |
| 3 | Opening authorisation | Context now separates work already authorised before approval (documentation, staging setup only, scratch-code spike) from work authorised only after AJ's written approval (W0 and W1 repository work); both closing statements aligned | Context, "What approval of this roadmap authorises", closing section |

## 0d. Revision 5 change log (two corrections; nothing else changed)
| # | Correction | Exact change | Where |
|---|---|---|---|
| 1 | `F6.1.0` / `F6.1.1` sequencing | `F6.1.0` is now the Ops endpoint only (W0, no Platform Core table). `F6.1.1` creates `product_integrations` and `product_list_state` and no longer depends on `F6.1.0`. The Platform Core refresher moves to new phase `F6.1.3` (depends on `F6.1.0`, `F6.1.1`, `F3.3.2`, `F1.2.1`), placed in W1 after `F6.1.1`. Tests split between the two phases | Section 5a, phase rows `F6.1.0`, `F6.1.1`, `F6.1.3`, dependency matrix and graph, W0 and W1, chunk overview, complexity table, scope note S5 |
| 2 | Claim limit concurrency | Limit enforced atomically by a business-row lock (`SELECT … FOR UPDATE` on the organisation) in every issue, consume, supersede and expire transaction, plus a database backstop: `pending_slot` 1 to 3 with a partial unique index. Tests CL-1 to CL-6 added | Part 1 section 2 (claim uniqueness row), O2 row, `F5.1.1` row, new section 0c |

## 0c. Concurrency test for the pending-claim limit (F5.1.1; real Postgres, separate connections, no mocks)
| Test | Setup | Action | Pass condition |
|---|---|---|---|
| CL-1 Parallel issuance | Business with 0 Owners and 0 pending | 8 simultaneous issue calls from separate connections, 8 different emails | Exactly 3 succeed, 5 return "limit reached", pending count is 3, no server error |
| CL-2 Owners plus pending | 2 Owners, 0 pending | 5 simultaneous issue calls | Exactly 1 succeeds; Owners plus pending is 3 |
| CL-3 Same email in parallel | 0 Owners | 6 simultaneous issue calls to one email | Exactly one claim is `pending` at the end; the others are `superseded`; only the final secret works |
| CL-4 Issue and consume together | 2 Owners, 1 pending | Concurrent consume of the pending claim and 3 issue calls | Owners never exceed 3; Owners plus pending never exceeds 3 |
| CL-5 Database backstop | Service lock bypassed | (a) 6 parallel raw `INSERT`s of pending claims for one business, each with a slot; (b) a raw `INSERT` with `status = 'pending'` and `pending_slot` NULL, and a raw `UPDATE` setting a pending claim's slot to NULL; (b2) a raw `INSERT` with `status` NULL (rejected by `NOT NULL`); (c) a raw pending `INSERT` with slot 0 or 4; (d) a raw `UPDATE` setting a non-pending claim's slot to 1; (e) a raw `UPDATE` moving a claim out of `pending` without clearing its slot | PostgreSQL rejects every insert after the third in (a); **(b) is rejected by the `CHECK` with a constraint-violation error (the test asserts the error, so a NULL-passes-the-check regression fails the test)**; (b2), (c), (d) and (e) are rejected; pending count is at most 3 |
| CL-7 Transfer racing issuance | 1 Owner, 1 pending, an O3 transfer ready for acceptance (target becomes second Owner, initiator stays) | Accept the transfer while 4 issue calls run simultaneously | Owners never exceed 3 and Owners plus pending never exceeds 3 at any committed point; exactly the allowed number of issue calls succeed; losers receive "limit reached", not a server error |
| CL-8 Transfer racing consumption | 1 Owner, 2 pending claims, an O3 transfer ready for acceptance (the Owners plus pending total is already 3) | Accept the transfer while both pending claims are consumed simultaneously | Owners never exceed 3; any operation that would exceed 3 fails cleanly with "owner limit reached"; at least one Owner always remains; no duplicate membership |
| CL-6 Expiry frees slots | 3 pending, 1 past `expiresAt` | Issue one claim | Expired claim is marked `expired` first; the new claim succeeds; pending count is 3 |

## 0b. Revision 4 change log (three consistency fixes; nothing else changed)
| # | Fix | Exact change | Where |
|---|---|---|---|
| 1 | Multiple pending owner claims | Uniqueness changed from one pending claim per business to one per `(businessId, boundEmail)`, max 3 pending owner claims per business; issue refused when Owners plus pending would exceed 3; cap re-checked at consumption; membership uniqueness, verified email and atomic consumption unchanged. Tests added: two legitimate owners claim independently, duplicate claim for the same email, three-owner limit | Part 1 section 2 (claim uniqueness row), O2 row, `F5.1.1` row |
| 2 | `F9.1.2` wording | "exactly one person" replaced by "at least one verified Owner, with up to three legitimate Owners" | `F9.1.2` row |
| 3 | Journey step 3 | Blanket "claim consumed; one owner membership" removed; O1 creator is already Owner, existing or migrated businesses get Owners through O2/O4 | Part 1 section 9 step 3 |
| check | Other references | Also reworded: O2 "business exists without an owner" (now covers further legitimate owners), O4 claim rule, Part 1 section 3 Owner row (now lists O1, O2/O4, O3). References to "exactly one organisation per `businessId`" are correct and stay | |

## 1. Completion levels and release gates (local-first unchanged)
| Level | Meaning | Evidence | Who signs | Touches staging/production? |
|---|---|---|---|---|
| **Phase complete** | The phase's technical acceptance criteria pass on the local machine | Its listed tests green, lint/typecheck/`check:migrations` clean, short doc note, status-table row | Me (reported to AJ in the status table) | Never |
| **Chunk complete** | All phases complete plus the chunk definition of done: real cross-app integration (no mocks), security and permission checks, regression of existing Caterly/Ops specs run individually, docs updated, next chunk's dependency checkpoint (IC) passed | Chunk status table with evidence | Me; AJ may attend the integration-checkpoint demo | Never |
| **Milestone release approval** | The full process: local development and testing → **AJ's full local review and written approval (L3)** → staging deploy and critical retests (S1 to S3) → **AJ's approval** → separate production plan approval (P1) → each production action approved (P2) | Milestone test report | AJ only | Staging only after L3; production only after P1 |
Rules: no phase or chunk is ever deployed to staging or production on its own; staging is validation of an already locally approved milestone, never a substitute for local testing; a staging-only defect returns the work to local. Staging setup (`F1.3`) and deploy assets (`F10.2.1`) are written and tested locally; real servers are touched only in `F11.3`.

## 2. Decision gates (replaces D1 to D12)
| Gate | Needed before | Decisions | Notes |
|---|---|---|---|
| **A** | Environment setup (`F1`) and spike (`F2`) | **D8** one `apps/platform` app serving `auth.localhost`, `account.localhost` and `store.localhost` (approved by AJ); **D14** local ports and `*.localhost` host convention: Caterly 3000, Site 3100, Ops 3200, Platform 3300, Stub 3500 (approved by AJ). **Gate A is D8 and D14 only.** The two external dependencies are separate and keep their own gates: **E1** (Logto Cloud dev tenant) is mandatory before `F2.1.4`; **E2** (read access to the old system export) is mandatory before `F0.1.2`. Neither is bypassed or removed | Nothing commercial or product-future |
| **B-1** (provider-independent; decided while the spike runs) | `F3.2.1` onward and `F5.1.0` | **D3** central roles and the Account permission matrix (section 4); **D4** central business locations (recommend: not central in M1); **D5** auth email sender and templates; **D7** product registry ownership (section 5); **D13** ownership flows O1 to O4 (section 3) | **Revision 10 status:** D3, D4, D7, D13 and the new D15 approved 2026-11-04; **D5 open**; O4 stays blocked on E2 (`F0.1.2`). `F0.1.4` is therefore partly closed |
| **B-2** (needs the spike) | `F3.1.2`, `F4`, anything provider-specific | **D1** provider; **D2** session lifetimes and outage extension (proposed 24 h) | |
| **B-late** | `F9.2.1` | **D6** seller/GST details on Ops Billing (cutover rehearsal) | Already open item |
| **C** | `F12` (M2) | **D9** coupon rules; **D12** M2 starts after M1 L3 approval (local only), not after M1 production; billing-rights confirmation; `PAST_DUE` wording | Closed by `F12.1.0` |
| **D** | `F16` onward (M3) | **D10** bundle and add-on commercial rules; **D11** Rivo repository, stack, timeline | Closed by `F16.1.0` |

## 3. Ownership flows (four separate flows; email is a one-time proof, never the stored identity)
| Flow | When | Steps | Identity of the Owner | Idempotency and safety | Tests |
|---|---|---|---|---|---|
| **O1 New business** | A signed-in, email-verified user with no membership for the product creates a business in Account | One transaction in Platform Core: mint `biz_` id, create organisation, create membership `Owner` for the creator's **global user id** | Creator's user id | Client idempotency key unique per (user, key); double submit returns the same business; per-user cap of 1 per product (D15, section 3b) and a rate limit | Double submit, concurrency, second business for the same product refused, unverified user refused |
| **O2 Claim of an existing business** | Business exists (Ops-provisioned or imported) and a legitimate owner must be established for it, either because it has none yet or because the source lists further legitimate owners | Staff or Ops issues a claim bound to an email, with a one-time secret sent to that address. Consumption needs **both** the secret and a sign-in whose **verified** email matches. One transaction consumes the claim and creates `Owner` membership for the signed-in **user id** | User id at consumption. The claim email stays only in the audit log | One pending claim per `(businessId, boundEmail)`, max 3 pending owner claims per business; supersede, expire (14 d), revoke; consume is `UPDATE … WHERE status='pending'`; one membership per (user, business); 3-Owner cap; the pending limit is enforced atomically by the business-row lock plus `pending_slot` constraint (Part 1 section 2) | Competing claims, replay, expired, wrong email, wrong secret, double submit, reissue creates no duplicate org or membership; two legitimate owners claim independently; duplicate claim for the same email; three-owner limit; simultaneous issuance cannot exceed the limit |
| **O3 Ownership transfer** | An existing Owner hands over or adds an Owner | Owner (fresh auth) names a target user, or invites by email which becomes an invitation as Owner. Target accepts while signed in with a verified email. One transaction adds `Owner` (cap 3); initiator chooses to stay Owner, step down to Admin, or be removed. Expires in 7 days; one pending transfer per business; blocked while `ownership_locked`. **Start and acceptance both take the organisation row lock (the same `lockOrganisation` helper as claim issue and consume) before checking or changing the Owner count, and re-check that Owners (after the change) plus pending claims do not exceed 3** | Target's user id | Two-party, atomic, last-owner invariant, shared lock with claims | Cap, abandoned, cancelled, locked, concurrent transfers, last owner leaving; transfer racing claim issuance and claim consumption (CL-7, CL-8) |
| **O4 Migrated customer** | One of the 3 existing customers moves in | Loader creates **one** organisation per `businessId` under its `legacy_id ↔ businessId` mapping and **no membership**. The source records establish who the legitimate owners are (one or several, maximum 3 = the cap in Part 1 section 12). AJ confirms each owner out of band and approves the list; if the source shows more than 3, AJ chooses 3 and the rest become Admin. One O2 claim per confirmed owner is issued to that person's confirmed address (claim uniqueness is per `(businessId, boundEmail)`, at most 3 pending per business, and the 3-Owner cap is re-checked at consumption). On each person's first verified login, consumption creates `Owner` for that user id and records `legacy_user_id ↔ user id`. Staff come as **migration staff invitations (type I2, section 3a)** and become memberships at first verified login | User id at consumption | Email proves control once; nothing stores email as a key. Until the first claim is consumed the business has no member. **Done when every migrated business has at least one verified Owner and no more than 3.** Re-run changes nothing | M-01, M-02 in section 12 |

## 3a. Two invitation types (distinct `kind`, distinct lifetimes, separate tests)
| Type | Used for | Lifetime | Issued by | Role carried | Consumption | Built in |
|---|---|---|---|---|---|---|
| **I1 Standard invitation** | Team invitations from Account or the Caterly Team page | **48 hours** (same value as today's `INVITATION_EXPIRY_HOURS`); resend resets to 48 h | Owner or Admin (section 4) | Admin, Manager or Member; never Owner | Secret token plus sign-in with the verified matching email | `F5.2.1` |
| **I2 Migration staff invitation** | Staff of the 3 migrated customers only | **14 days**; reissue after expiry only by staff through the migration tooling, never from the UI | The migration loader, only for an AJ-approved list and tagged with the import batch id | Default Member, product role hint mapped from the source | Same as I1 | `F10.1.1` |
Owner access never travels by invitation; it uses O2 claims (14 days) or O3 transfers (7 days). Tests (`I-01` to `I-07`): I1 valid at 47 h and expired at 49 h; I1 resend restarts 48 h; I2 valid at day 13 and expired after day 14; I2 cannot be created through the Account API or UI; I1 cannot be given a lifetime above 48 h; wrong email, reuse and revoked tokens fail for both; neither type can carry the Owner role or any sensitive key.

## 3b. One membership per user per product (D15, approved 2026-11-04; supersedes any multi-business assumption)
**Rule.** One email is one Platterly identity. The identity has at most one membership, in any role, for each product. It may have one Caterly membership and one Rivo membership. It cannot hold a second Caterly membership, as owner or as staff. A second kitchen requires a different email address. There is no organisation switcher and no multi-business list.

**Database enforcement (specification for `F5.1.0` to confirm before `F3.2.1`).** An organisation can be linked to several products, so a plain unique key on `organisation_members` cannot express the rule. Required shape:
| Element | Requirement |
|---|---|
| `membership_product_slots` (new table) | One row per (member, linked product): `user_id`, `product_key`, `organisation_id`, `member_id`. **`UNIQUE (user_id, product_key)`** is the guarantee. Foreign keys to `organisation_members` and to the organisation's product link, so a slot cannot outlive either |
| When a member is added | The slot rows for every product the organisation is linked to are inserted in the same transaction as the membership. A unique violation fails the whole add |
| When a product is linked to an organisation | A slot is inserted for every existing member in the same transaction. If any member already holds a slot for that product elsewhere, the link is refused as a whole and reported to staff with the member count, never the other business's identity |
| When a member leaves, is removed or the link is removed | The slots are deleted in the same transaction; the freed slot is usable at once |
| Locks | Every path takes the shared `lockOrganisation` helper; the unique index is the backstop if two paths race on different organisations |
| Case | The email unique index is on `lower(email)` |
| Ownership of the rule | Platform Core enforces it for central paths. Caterly's own table is untouched in W1 (Part 3 section 13 note) |

**Where each flow enforces it**
| Flow | Check |
|---|---|
| O1 new business | Refused if the creator already holds a slot for the product (clear message: "this email already has a Caterly kitchen"). Cap = 1 per product. Double submit still returns the same business |
| O2 claim | Issue: refuse when the bound email already belongs to a user who holds a slot for that product, and tell staff to use a different email. Consume: re-check in the consuming transaction; the unique index decides a race |
| O3 transfer | Target must hold no slot for the product (or already be a member of this same business). Checked at start and at acceptance |
| I1 and I2 invitations | At send: refuse if that email's identity already has a slot for the product (and say so to the inviter without revealing whose). At accept: re-check. One pending invitation per (organisation, `lower(email)`) (partial unique index). When one invitation for a product is accepted, other pending invitations to the same email for the same product are superseded in the same transaction |
| Auto-provision / self-heal (Caterly) | Unchanged in W1 |
| Migrated customers (O4) | If the source shows one person in two businesses of the same product, the loader reports it and stops for AJ's decision. It never merges or picks silently (test M-03) |

**Questions for the `F5.1.0` spec (not yet decided):** whether a freed slot has any cooling-off period (proposed: none); how staff recover an owner who locked themselves out by choosing the wrong email (proposed: the dispute procedure, section 12); what message the invitee sees when refused. None of them changes the rule.

## 4. Account permission model (central; separate from product permissions) , **approved as D3 on 2026-11-04**: Owner, Admin, Manager and Member kept; every Owner-only row needs fresh authentication (`max_age`)
Central permissions only; Caterly's `owner/manager/staff/...` roles, overrides and sensitive keys stay inside Caterly (Part 1 section 3).
| Action | Owner | Admin | Manager | Member | Notes |
|---|---|---|---|---|---|
| Create a business | any verified user (becomes Owner, O1) | | | | Capped per user |
| View business, members, products | Yes | Yes | Yes | Yes | |
| Edit business details | Yes | Yes | No | No | |
| Invite members (as Admin, Manager, Member) | Yes | Yes | No | No | Owner role only via O2/O3 |
| Remove members | Any non-Owner | Manager and Member only | No | No | Owner removal only by the dispute procedure |
| Assign central roles | To Admin, Manager, Member | To Manager and Member | No | No | No self-promotion; Admin cannot touch Admin or Owner |
| Activate a product (link) | Yes | Yes | No | No | Paid activation also needs the billing right below (M2) |
| Suspend or unlink a product | Yes | No | No | No | |
| Purchase a subscription (M2) | Yes | No | No | No | Matches today's `/subscribe` (owners only) |
| View invoices and payment history | Yes | Yes | No | No | |
| Change billing and GST details | Yes | No | No | No | |
| Cancel, upgrade, downgrade (M2) | Yes | No | No | No | |
| Initiate ownership transfer (O3) | Yes, fresh auth | No | No | No | |
| Manage own profile and security | Everyone | | | | |
| Delete a business | Not available in Account | | | | Manual only by staff, as AJ decided |
Enforced in one place (`F3.2.3`, a typed permission map `org.edit`, `member.invite`, `member.remove`, `member.role.assign`, `product.activate`, `product.unlink`, `billing.view`, `billing.manage`, `ownership.transfer`) and tested as a full matrix (every role × every action × own/other organisation). Sensitive Caterly keys are never reachable from any row.

## 5. Product registry: one authoritative source per type of information (resolves D7)
| Information | Authoritative source | Everyone else |
|---|---|---|
| Product exists; product key (assigned once, immutable, `isProductKey` format) | **Ops** (staff register it, as today in `apps/ops/src/modules/registry/products.ts`) | Platform Core receives it read-only |
| Product name, base URL | **Ops** | Platform Core caches by key and refreshes |
| Plans, prices, GST, trials, entitlement definitions, commercial catalogue | **Ops** (built from the product's manifest) | Store and Account read through the Ops API |
| Ops ↔ product channel secrets (commands, events, billing) | **Ops** (existing encrypted dual-secret pair) | Product holds its copy |
| Platform ↔ product channel secrets (link commands, membership events, pull API) | **Platform Core**, a separate secret pair per product, rotated independently | Product holds its copy |
| OIDC client (client id and secret, redirect URIs, back-channel logout URL) | **Platform Core** (it is the identity provider) | Product holds its client settings; URLs must be on the host registered in Ops |
| Organisation ↔ product link state | **Platform Core** | Account displays it |
| Commercial access state (trial, active, locked) | **Ops** snapshot | Product evaluates locally |
How it stays in sync without sharing secrets: (1) staff register the product in Ops; (2) Platform Core refreshes a signed, read-only Ops product list daily and on a `product.changed` event, and staff then press "Enable identity integration" in Platform Core, which creates the OIDC client and the platform secret pair for that key; (3) staff paste the settings into the product, as step 3 of `docs/ops-cutover.md` does today. Rotation: each channel is rotated by the system that owns it, two secrets valid at once, product accepts both, audit entry; nothing is copied between Ops and Platform Core. If Ops deactivates a product, Platform Core suspends its integration at the next refresh. No master `products` table exists in Platform Core; only `product_integrations` keyed by product key.

## 5a. Ops product-list API: authentication, signing, availability (endpoint = F6.1.0 in W0; Platform Core refresher = F6.1.3 after F6.1.1)
**Phase split (so no earlier work depends on a table that does not exist yet):** `F6.1.0` builds only the Ops side: the read-only endpoint, request and response signing, the "platform-reader" secret pair stored in Ops, the response schema (a zod schema in the existing `packages/contract`), and contract tests run with a throwaway test client. It touches no Platform Core table. `F6.1.1` then creates `product_integrations` (with its status columns) and a one-row `product_list_state`. `F6.1.3` builds the Platform Core refresher on top of both: fetch, verify, atomic apply, failure and stale handling, deactivation and reactivation, base-URL review. Rows below marked (F6.1.0) belong to the Ops side; all others are implemented in `F6.1.3`.
| Topic | Rule |
|---|---|
| Endpoint | `GET /api/platform/products` on Ops. Read-only. Returns `{ listVersion, generatedAt, products: [{ productKey, name, baseUrl, active }] }`. No secrets, no plans, no prices |
| Caller authentication | Platform Core signs every request with the existing route-bound HMAC-SHA256 scheme (`<timestamp>.<METHOD>.<path+query>.<body>`, headers `X-Platterly-Timestamp` and `X-Platterly-Signature`, 300 s window, constant-time compare) using `packages/contract/src/signing.ts`. It uses its **own** secret pair, "platform-reader", stored encrypted in Ops and in Platform Core, never a product's command secret; two secrets valid at once for rotation; HTTPS only |
| Response authentication | Ops signs the response body (the existing v1 response signature); Platform Core rejects an unsigned, tampered or schema-invalid response |
| Applying a list | All-or-nothing in one transaction, and only if `listVersion` is not lower than the stored one |
| Refresh schedule | Daily, plus a staff "Refresh now" button, plus an optional signed `product.changed` ping from Ops that only triggers a pull (the ping carries no data to trust; a lost ping is harmless) |
| Refresh failure | Keep the last good list and `lastRefreshedAt`; retry with backoff 5 min, 15 min, 1 h, 6 h; alert staff after two consecutive failures or 26 hours without success. A failed refresh never removes, changes or suspends an integration |
| Stale list | Up to 26 h: normal. Over 26 h: staff warning. Over 7 days: critical banner and **enabling a new identity integration or accepting a base-URL change is blocked** until a refresh succeeds. Existing integrations (sign-in, links, sync) keep working because they do not call this API at request time |
| Product deactivated in Ops | At the next successful refresh the integration becomes `suspended`: no new OIDC authorisations, no new links; outbox events for it are held (up to 30 days, not dead-lettered); nothing is deleted. Reactivation in Ops restores it and held events resume. Staff are alerted on every status change |
| Product missing from the list | Treated as deactivated only after two consecutive successful refreshes both omit it (guards against a partial list); the integration row is never deleted |
| Base URL changed in Ops | Integration moves to `needs_review`; redirect URIs and delivery URLs are **not** changed automatically; staff re-confirm them (prevents silent redirection to another host) |
| Tests, F6.1.0 (Ops side, in W0) | Request tamper, replay, wrong secret, expired timestamp, response tamper, response schema validation, `listVersion` increases when the list changes, no secrets or prices in the payload, rotation with both secrets valid, unauthenticated request refused |
| Tests, F6.1.3 (Platform Core side) | Schema-invalid or tampered response rejected with no change, list with a lower `listVersion` rejected, atomic apply (a failure mid-apply leaves the old list), Ops unreachable (last good kept, backoff, alert fires), partial list (absent once: no change; absent twice: suspended), deactivate → suspend → reactivate with held events resuming, base-URL change → `needs_review`, stale thresholds at 26 h and 7 days with the enable and base-URL guard, "Refresh now" and ping trigger a pull |

## 6. Changed and new phases (format: Objective · Scope in/out · Depends · Tasks · DB · API/UI · Security · Tests · Done when · C/U)
| Phase | Objective and scope | Depends | Tasks | DB | API · UI | Security | Tests (extra to T-STD) | Done when | C/U |
|---|---|---|---|---|---|---|---|---|---|
| **F0.1.3** Gate A closure | Close only D8 and D14. Out: all else. E1 and E2 are not part of this gate: E1 stays mandatory before `F2.1.4` and E2 before `F0.1.2` | F0.1.1 | Put the two to AJ with recommendations (done: both approved) | none | none | When E1 is given: Logto tenant is dev-only; no customer data sent | none | Answers recorded | S/L |
| **F0.1.4** Gate B-1 closure | Close D3, D4, D5, D7, D13 (O4 part after F0.1.2). **Revision 10 status (2026-11-04): partly closed.** D3, D4, D7, D13 and new D15 approved; D5 open; O4 blocked on E2 | F0.1.2, F0.1.3 | Present sections 3 to 5 for decision | none | none | none | none | Recorded; runs during the spike | S/M |
| **F0.1.5** Gate B-2 closure | Close D1, D2 | F2.1.5 | Present spike report | none | none | none | none | Provider chosen | S/L |
| **F1.1.1** App shell | Unchanged scope | **F0.1.3** (was F0.1.3 with all D1 to D12) | unchanged | none | health | host-only cookies | host routing | boots | M/L |
| **F2.1.1** Package and feature check | Unchanged | **F0.1.3** (Gate A only) | unchanged | scratch | scratch | no real credentials | checklist | table filled | M/H |
| **F2.1.4** Logto comparison | Unchanged | F2.1.2, F2.1.3, **E1** | unchanged | none | none | dev tenant | same | scored table | M/M |
| **F3.1.1** Users | Platform Core owns `users` (global id, status), `user_identities` (provider, subject), `legacy_mappings`; the IdP holds credentials only | F1.1.2 (no D1) | schema, constraints | 3 tables | none | email never a key | unique cases | migration green | M/L |
| **F3.1.2** Identity-link service | `findOrCreateBySubject`, idempotent | F3.1.1, **F0.1.5** | service | none | internal | none | concurrent calls create one user | idempotent | S/M |
| **F3.2.1** Org schema | `organisations`, `organisation_members` (central role, status, `membership_version`) reference `users.id`. **Revision 10 (D15):** also `membership_product_slots` with `UNIQUE (user_id, product_key)` and the `lower(email)` unique index (section 3b); acceptance adds: a second membership for the same user and product fails at the database, for every role, with real connections | F3.1.1, **F0.1.4** (D3, D4) | partial unique indexes | 2 tables | none | isolation by construction | constraints | migration green | L/M |
| **F3.2.2** Org services | **Revision 10:** every add-member, link-product, remove and leave path inserts or frees slots in the same transaction (section 3b); Idempotent create on `businessId`; **O1 creator becomes Owner**; add/remove/change role; last-owner invariant; version bump | F3.2.1 | row-locked transactions through one shared `lockOrganisation(tx, businessId)` helper (`SELECT … FOR UPDATE` on the organisation row) that every Owner-count change, claim operation and O3 step must use | none | service | last owner cannot leave | O1 tests in section 3; a unit test that every Owner-changing service calls the helper | one org per id under race | L/M |
| **F3.2.3** Account permission map | Section 4 as code | F3.2.2, F0.1.4 | typed map and guards | none | service | cross-org denial | full role × action matrix, isolation suite | matrix green | M/L |
| **F3.3.1** Audit | unchanged | F3.2.2 | unchanged | audit_logs | none | no secrets | content | every change audited | S/L |
| **F3.3.2** Outbox | unchanged | F3.2.2, F1.2.1 | unchanged | outbox_events | cron | signed | retry, order, dead-letter | delivered once-effectively | L/M |
| **F4.1.1** Registration | unchanged | F3.1.2, F1.1.3, **F0.1.5** | unchanged | per D1 | UI | rate limits | Playwright | verified user | M/M |
| **F5.1.0** (new) Ownership flow spec | Turn O1 to O4 into a precise spec and test plan; no code. **Revision 10:** includes the D15 enforcement points in section 3b, its three open questions, and the invitation rules (one pending invitation per (organisation, `lower(email)`); supersede competing invitations for the same product on accept) | F0.1.4 | write spec, state diagrams, test list | none | none | none | test list reviewed | AJ accepts | S/L |
| **F5.1.1** Claims (O2) | unchanged scope, now explicitly O2 | F3.2.2, F4.1.1, F5.1.0 | unchanged | claims table | internal | secret plus verified email | O2 tests | no duplicates | L/M |
| **F5.3.1** Transfer (O3) | Section 3 O3; uses the shared `lockOrganisation` helper from `F3.2.2` before checking or changing the Owner count | F5.1.1, F5.1.0, F3.2.2 | flows | transfers | internal | fresh auth, shared organisation lock, Owners plus pending ≤ 3 | O3 tests plus CL-7 and CL-8 | works under race; combined limit never exceeded | M/M |
| **F6.1.0** (new) Ops product-list endpoint (Ops side only) | Section 5a Ops rows: `GET /api/platform/products`, request and response signing, "platform-reader" secret pair, response zod schema. **Out: any Platform Core code or table** | Ops signing helper (`packages/contract/src/signing.ts`) only; F1.2.1 not required | Endpoint, secret pair generation and rotation in Ops, response schema in `packages/contract`, contract tests with a throwaway test client | Ops: one small additive table or encrypted setting for the secret pair, reusing `OPS_SECRETS_KEY`; Platform Core: none | signed GET; optional signed `product.changed` ping sender | separate secret, request and response signed, no secrets or prices in payload | section 5a "Tests, F6.1.0" | Test client verifies signed list, every tamper and rotation case behaves as specified | S/L |
| **F6.1.3** (new) Platform Core product-list refresher | Section 5a Platform Core rows: fetch and verify the list, atomic apply, backoff and alert, stale thresholds with the enable and base-URL guard, deactivation and reactivation (outbox events held), missing-product rule, base-URL `needs_review`, "Refresh now", ping receiver | F6.1.0, F6.1.1 (schema), F3.3.2 (outbox, for held events), F1.2.1 | refresher job on the cron endpoint, status transitions, staff screen additions | uses `product_integrations` and `product_list_state` from F6.1.1 (no new tables) | signed GET client; signed ping receiver; staff UI | atomic apply, never auto-change URLs, never delete rows | section 5a "Tests, F6.1.3" | Every failure, stale, deactivation and base-URL case behaves as specified against a locally running Ops | M/M |
| **F6.1.1** Product integrations | `product_integrations` keyed by key; OIDC client creation; platform secret pair (section 5). No master products table | F3.2.1, F1.2.1, F0.1.4 (D7); **no dependency on F6.1.0** | staff screen "Enable identity integration" | `product_integrations` (key, cached name and base URL, status `current` / `needs_review` / `suspended`, `absentRefreshes`) and one-row `product_list_state` (`listVersion`, `lastRefreshedAt`, `consecutiveFailures`, `lastError`) | staff UI | secrets encrypted, dual-secret rotation | rotation test | seeded locally: catering, stub; the refresher (F6.1.3) later keeps rows in sync | M/M |
| **F6.1.2** Link sender | Platform Core sends `organisation.link` (idempotent, adopts id, creates no users). Integration-tested against the stub in W3 | F6.1.1 | sender plus contract | link status | signed POST | signature | repeat returns same record | contract tests W2, integration test W3 | M/M |
| **F8.2.2** Caterly link receiver | Consumes `F6.1.2` contract; creates Members only through `withMemberLock` (`F8.2.4`) | F6.1.2, F8.2.1, F8.2.4 | unchanged | none | signed POST | signature | provision then owner login gives one org | journey J3 | L/M |
| **F8.2.3a–g** Member uniqueness | Section 13, in this order: a local audit, b report, c recovery plan, d local resolution and local migration test, e AJ's local approval, f staging audit and migration, g production audit and separately approved migration | a: none (W0); b: a **successfully completed** (audit output exists; b cannot start earlier, and is in W1); c: b and AJ approval; d: a to c; e: d (part of F11.2.1); f: e and F11.3.1; g: f and P2 approval | audit, report, recovery plan, local test, staging, production | unique index (applied only at d locally, f staging, g production) | none | no data loss; nothing merged or deleted silently | audit on a local copy, then per step | per section 13 | S/M |
| **F8.2.4** (new) Member advisory-lock convention | `withMemberLock(userId, organizationId, fn)` helper and its use in every path that creates or updates a Caterly `Member` (onboarding and provisioning, invitation acceptance, Team management, any other found by code search, and all new central paths). In scope: wrapping existing paths without changing behaviour. Out: the unique index | none for the helper; must precede F8.2.1, F8.2.2, F8.3.1 and F8.3.3 | helper, wrap existing paths, guard test, concurrency test | none | none | no duplicate memberships under concurrency | guard test; the 8-way concurrency test; **the two-simultaneous-acceptances test through the real Better Auth API on separate real PostgreSQL connections with the unique index absent (exactly one `Member` row, no server error, lock held for the full Better Auth call; section 13)**; the Caterly specs that touch these paths (`kitchenlogin`, `team-management`) run individually | Guard test green; both concurrency tests leave exactly one row with no server error; existing specs pass | M/M |
| **F9.1.2** Provision and claim path | Ops-provisioned or imported business ends with at least one verified Owner, with up to three legitimate Owners, via O2 | F5.1.1, F8.2.2 | wire through Platform Core | none | signed | claim proof | provision then sign-up: one org | audited gap closed | M/M |
| **F9.2.2** M1 billing integration | **Existing Caterly flow only.** A business created via Account (O1) and linked (F7.3.2) gets its trial from Ops and a snapshot in Caterly; the owner pays on Caterly's existing `/subscribe` through the Ops billing API with Razorpay test keys; webhook replay; lock lifts; existing invoice PDF. Out: Store, coupons, Account billing pages | F9.2.1, F7.3.2 | integration tests | none | none | webhook signature | `billing`, `payment-grace`, `subscription-plan-button` specs plus journey B1 to B5 | IC5 passes | M/M |
| **F10.1.1** Mapping and loader | Includes O4: organisation without membership, owner claims (O2, one per confirmed owner, max 3), staff I2 invitations, import manifest (batch id, time, content hash), safe-write outcomes | F0.1.2, F5.1.1, F9.1.3, F5.1.0 | scripts | mappings, batch id | CLI | source read-only | idempotent re-run | rerun changes nothing | L/H |
| **F10.1.5** (new) Migration acceptance suite | Run M-01 to M-14 (section 12) on data copies, per customer | F10.1.4 | suite and report | none | CLI | copies only | section 12 | AJ reviews report | M/H |
| **F12.1.0** (new) Gate C closure | Close D9, D12, billing-rights confirmation, `PAST_DUE` wording | F11.2.1 | decisions | none | none | none | none | recorded | S/L |
| **F16.1.0** (new) Gate D closure | Close D10, D11 | F15.1.2 | decisions | none | none | none | none | recorded | S/L |

## 7. Revised chunk overview (structure retained; 21 chunks, 56 groups)
| Chunk | Name | Milestone | Groups | Revision |
|---|---|---|---|---|
| F0 | Documentation and decisions | Pre-M1 | 1 | Decisions now in gates A, B-1, B-2 (`F0.1.3` to `F0.1.5`) |
| F1 | Local platform environment | M1 | 3 | Depends on D8 and D14 (Gate A) only. Needs neither E1 nor E2 |
| F2 | Identity provider spike | Pre-M1 | 1 | Depends on Gate A (D8, D14); `F2.1.4` (Logto comparison) additionally requires E1 |
| F3 | Platform Core | M1 | 3 | Data layer provider-independent; `F3.1.2` waits for D1 |
| F4 | Identity service | M1 | 3 | Waits for B-2 |
| F5 | Claims, invitations, ownership | M1 | 3 | New `F5.1.0` flow spec |
| F6 | Product links, sync, client library | M1 | 3 | New `F6.1.0` (Ops endpoint) and `F6.1.3` (refresher); `F6.1.2` circularity removed |
| F7 | Account portal (identity side) | M1 | 3 | Unchanged |
| F8 | Caterly integration | M1 | 4 | `F8.2.3` split |
| F9 | Ops alignment and billing cutover | M1 | 2 | `F9.2.2` M1 only (existing flow) |
| F10 | Migration and operational tooling | M1 | 2 | New `F10.1.5` |
| F11 | M1 verification and release | M1 | 4 | Unchanged |
| F12 | Ops commerce extension | M2 | 4 | New `F12.1.0` Gate C |
| F13 | Account commerce pages | M2 | 3 | Unchanged |
| F14 | Store | M2 | 3 | Unchanged |
| F15 | M2 verification and release | M2 | 2 | Unchanged |
| F16 | Ops multi-product readiness | M3 | 2 | New `F16.1.0` Gate D |
| F17 | Rivo integration | M3 | 2 | Unchanged |
| F18 | Bundles and add-ons | M3 | 3 | Unchanged |
| F19 | Unified workspace | M3 | 3 | Unchanged |
| F20 | M3 verification and release | M3 | 2 | Unchanged |

## 8. Dependency matrix, graph, critical path (replaces Part 2 section B)
| Chunk | Hard dependencies (phase level) | Genuinely parallel with |
|---|---|---|
| F0.1.1, F0.1.2 | none (E2 for F0.1.2) | F1.1 |
| F0.1.3 (Gate A: D8, D14) | F0.1.1 | F1.1 |
| F1 | F0.1.3 | F2 |
| F2 | F0.1.3 (E1 at F2.1.4) | F1, F3 data layer |
| F0.1.4 (Gate B-1) | F0.1.2, F0.1.3 | the spike |
| F3.1.1 → F3.2.1 → F3.2.2 → F3.2.3, F3.3 | F1.1.2, F1.2.1 (for F3.3.2), F0.1.4 | the spike (F2) |
| F0.1.5 (Gate B-2) | F2.1.5 | none |
| F3.1.2, F4 | F3.1.1, F0.1.5 | F6.1.x, F5.1.0 |
| F5.1.1+ | F3.2.2, F4.1.1, F5.1.0 | F6.1 |
| F6.1.0 | Ops signing helper (`signing.ts`) only; touches no Platform Core table | W0, W1 |
| F6.1.1 | F3.2.1, F1.2.1, F0.1.4 | F4 |
| F6.1.3 | F6.1.0, F6.1.1, F3.3.2, F1.2.1 | F4, F5.1.0 |
| F6.1.2 | F6.1.1 (integration test after F6.3.3) | F4 |
| F6.2 | F3.3.2, F6.1.2 | F4.3 |
| F6.3 | F1.2.1, F4.2.2, F3.2.3 | F5 |
| F7 | F4.2, F5, F6.1.2, F8.2.2 (for F7.3.2) | F8 |
| F8 | F4.2.2, F6.3, F5.1 | F7, F10.2 |
| F9 | F6.2, F8.2, F5.1.1 | F10.1 |
| F10.1 | F0.1.2, F5.1.1, F9.1.3 | F9.2 |
| F11 | F7 to F10 | none |
| F12 | F11.2.1 (D12) | F13 UI scaffolding |
| F13, F14 | F12 | each other after F12.1 |
| F15 | F13, F14 | none |
| F16 | F15.1.2, Gate D | F17 start after F16.1 |
| F17, F18, F19 | as Part 2 | F18 with F19 |
**Graph (edges):** Gate A → {F1, F2} · F1.1.2 → F3.1.1 → F3.2.1 → F3.2.2 → {F3.2.3, F3.3.1, F3.3.2} · F2.1.5 → Gate B-2 → {F3.1.2, F4} · F4.2.2 → {F6.3.1, F7.1.1, F8.1.1} · F6.1.1 → {F6.1.2, F6.1.3} · F6.1.0 → F6.1.3 · F3.3.2 → F6.1.3 · F6.1.2 → {F6.2.1, F6.3.3, F8.2.2} · F5.1.0 → {F5.1.1, F5.3.1, F10.1.1} · F5.1.1 → {F9.1.2, F10.1.1} · F8.2.2 → {F7.3.2, F9.1.2} · F9.1.3 → F9.2.1 → F9.2.2 · F10.1.4 → F10.1.5 → F11.1.1 · F11.2.1 → F12.1.0 → F12 → {F13, F14} → F15 → F16.1.0 → F16 → {F17, F18} → F19.
**Critical path (M1):** F0.1.3 → F2.1.5 → F0.1.5 → F3.1.2 → F4.1/F4.2 → F5.1.1 → F6.1.2/F6.3 → F8.1 to F8.3 → F9.1 to F9.2 → F10.1.5 → F11. Platform Core's data layer is off the critical path.
**Blocking decisions and external needs:** Gate A (D8, D14), E1 (Logto tenant, mandatory before `F2.1.4`), E2 (old-system read access, mandatory before `F0.1.2`), B-1, B-2, D6 before `F9.2.1`, staging access before `F11.3`.
**Rework risks if sequenced wrongly:** unchanged from Part 2 section B, plus: starting `F3.2.1` before Gate B-1 (roles and matrix could change the schema); building `F10.1.1` before `F5.1.0` (O4 could be redone); applying the Member unique index before the audit.

## 9. Execution waves with genuine parallelism (replaces Part 2 section C)
| Wave | Parallel streams (each stream is strictly ordered inside) | Entry condition | What is NOT parallel, and why |
|---|---|---|---|
| **W0** | A: `F0.1.1` → `F0.1.3` (Gate A); `F0.1.2` (needs E2). B: `F1.1.1` → `F1.1.2`, `F1.1.3` → `F1.2.1`; `F1.3.1`, `F1.3.2`. C: `F8.2.3a` duplicate audit (read-only, no dependencies) and `F6.1.0` (Ops endpoint, signing and contract tests only; no Platform Core code) | none (B starts after `F0.1.3`) | `F1.1.1` waits for Gate A (D8 and D14 only); `F0.1.2` still needs E2. The Platform Core refresher (`F6.1.3`) is not in W0 because its tables come from `F6.1.1` |
| **W1** | S (spike): `F2.1.1` → `F2.1.2` ∥ `F2.1.3` → `F2.1.4` → `F2.1.5` → `F0.1.5`. P (Platform Core data layer): `F0.1.4` → `F3.1.1` → `F3.2.1` → `F3.2.2` → `F3.2.3` ∥ `F3.3.1` → `F3.3.2`; then `F5.1.0`, `F6.1.1` → `F6.1.3` (after `F3.3.2` and `F6.1.0`), `F6.3.2`, `F8.2.3b` | W0 done: `F1.1.2`, `F1.2.1`, Gate A, **and `F8.2.3a` (the read-only Member duplicate audit) successfully completed with its output produced; `F8.2.3b` (the report) must not start before then**. Stream P also needs Gate B-1 (`F0.1.4`) | `F3.1.2`, all `F4`, `F5.1.1`: need D1 or verified identity. Stream P stalls if B-1 or E2 (for O4) is late **Revision 10 (2026-11-04):** stream P may start `F3.1.1` once W0 entry holds; `F3.2.1` onward needs D3, D4, D7, D13, D15 (approved) and does **not** need D5. `F5.1.0` must include section 3b. Acceptance for stream P: the slot rule holds at the database for every role; concurrent add of the same user to two businesses of one product leaves one membership; concurrent duplicate invitations leave one pending; O1 to O3 and I1/I2 refuse a user with a slot; section 3b tests pass with real connections. No Caterly code, schema or data changes in W1. Items that still block: D1/D2 (for `F3.1.2` and all F4), E1 (for `F2.1.4`), E2 (for `F0.1.2` and O4), D5 (for `F4.1.1`) |
| **W2** | I (identity): `F3.1.2` → `F4.1.1` → `F4.1.2`, `F4.1.3` → `F4.2.1` → `F4.2.2` ∥ `F4.2.3` → `F4.3`. L (links): `F6.1.2` (contract tests only), `F6.2.1` | Gate B-2; stream L needs `F6.1.1`, `F3.3.2` | `F6.1.2` integration test waits for the stub (W3); `F6.2.1` consumers wait for W3 |
| **W3** | `F5.1.1` → `F5.1.2`; `F5.2`; `F5.3.1` → `F5.3.2`, `F5.3.3`. `F6.3.1` → `F6.3.3` stub; `F6.2.2`, `F6.2.3`; checkpoints IC1, IC2 | `F4.2.2`, `F4.1.1` | `F5.3.3` needs `F4.1.2`. Caterly work waits for IC2 |
| **W4** | U: `F7.1` → `F7.2` → `F7.3.1`. C: `F8.1` → `F8.2.4` → `F8.2.1` → `F8.2.2` → `F8.3` (`F8.3.1` and `F8.3.3` also need `F8.2.4`) → `F8.4`; `F8.2.3c` and `F8.2.3d` (local copy only, after a to c). T: `F10.2` | IC2 passed | `F7.3.2` waits for `F8.2.2`. `F8.3.1` needs `F6.2.2`. `F8.2.3d` is local only; `F8.2.3e` to `g` wait for the M1 local approval, staging and production gates respectively |
| **W5** | `F9.1.1` → `F9.1.2` → `F9.1.3` → `F9.2.1` → `F9.2.2`; `F10.1.1` → `F10.1.2` → `F10.1.3` → `F10.1.4` → `F10.1.5` | `F8.2.2`, `F5.1.1`; D6 before `F9.2.1` | `F10.1.1` needs `F9.1.3` |
| **W6** | `F11.1.1` → `F11.1.2`, `F11.1.3` → `F11.2.1` (AJ local review) → `F11.3.1` (staging) → `F11.4.1` | All M1 chunks complete | Strictly sequential: this is the milestone release path |
| **W7** | `F12.1.0` (Gate C) → `F12.1` → `F12.2` → `F12.3`, `F12.4`; `F13`, `F14` after `F12.1` | `F11.2.1` (D12), local only | No M2 staging before M2 L3 |
| **W8** | `F15` | | |
| **W9** | `F16.1.0` → `F16`; `F17`, `F18` (after `F16.1`), `F19` | `F15.1.2`, Gate D | `F18` needs `F16.2` |
| **W10** | `F20` | | |

## 10. Integration checkpoints (real apps, no mocks)
| IC | After | Milestone | Proves |
|---|---|---|---|
| IC1 | `F4.2` | M1 | A client app signs in, validates tokens, signs out via the IdP |
| IC2 | `F6.3.3` | M1 | Stub product: SSO, back-channel logout, membership sync, removal inside the bound, link command idempotent |
| IC3 | `F8.3` | M1 | Caterly does the same with its own permissions and organisation-scoped revocation |
| IC4 | `F9.1.2` | M1 | Ops, Platform Core and Caterly agree on exactly one organisation per `businessId` and at least one verified Owner (up to the cap of 3); a repeated claim, provision or link creates no second organisation and no duplicate membership |
| IC5 | `F9.2.2` | M1 | Account-created business: trial from Ops, payment through the **existing** Caterly `/subscribe`, webhook replay idempotent, lock lifts |
| IC6 | `F10.1.5` | M1 | Three customers migrate on copies; M-01 to M-14 pass |
| IC7 | `F12.1` | M2 | Account reads billing data only through signed Ops APIs |
| IC8 | `F14.2.2` | M2 | Store checkout end to end: coupon, payment, entitlement, invoice |
| IC9 | `F17.2` | M3 | Rivo passes the same conformance tests as the stub |
| IC10 | `F19.1` | M3 | Workspace summaries respect per-product permissions |

## 11. Acceptance criteria by milestone (replaces Part 2 section D milestone line; chunk definition of done is Part 2 section D plus the levels in section 1)
| Milestone | In scope | Journey and tests (all run locally first, individually, never the full suite) |
|---|---|---|
| **M1 Identity and Caterly** | Platform Core, identity, claims, invitations, ownership, Account (profile, security, businesses, members, products), Caterly integration, Ops alignment, billing cutover with Caterly's existing `/subscribe`, migration and ops tooling | **J1** register and verify; **J2** create business (O1); **J3** activate Caterly, onboarding runs unchanged; **J4** sign out and in on Caterly, correct permissions; **J5** invite staff, accept, default product role, no sensitive keys; **J6** remove user from business A only, business B unaffected; **J7** claim cases (O2) and transfer (O3); **J8** break-glass drill; **B1** trial starts in Ops and snapshot reaches Caterly; **B2** owner pays on the existing `/subscribe` with test keys; **B3** replayed webhook creates no second payment; **B4** lock lifts; **B5** existing invoice PDF; stub-product SSO and logout; IC1 to IC6; Caterly regression list (`F8.4.2`); M-01 to M-14 |
| **M2 Account and Store** | Store catalogue, checkout, coupons, Account Overview, Subscriptions, Invoices, Payments | **S1** open Store signed in; **S2** choose plan and frequency; **S3** coupon; **S4** GST details and Razorpay test payment; **S5** webhook replay; **S6** entitlement activation and invoice; **S7** Account shows product, subscription, invoice, payment, renewal; **S8** failed payment → grace → lock; refunds; upgrade/downgrade/cancel; IC7, IC8 |
| **M3 Rivo, bundles, workspace** | Rivo, bundles, add-ons, workspace | **R1** Rivo SSO with no second login and no data leak (original step 10); bundle purchase and entitlements; add-ons; cancel one product keeps the other unless terms say otherwise; cross-product permissions; IC9, IC10 |
Each milestone: complete when its criteria pass locally, then AJ's L3 approval, staging S1 to S3, AJ's approval, and a separate production plan approval.

## 12. Migration acceptance suite (F10.1.5; per customer, on data copies)
**Old system status:** it stays **live and authoritative** until AJ approves the migration. It keeps accepting changes while migration is rehearsed; changes are handled by delta reconciliation (M-09), or the old system is frozen for an agreed period, in which case it is read-only only while that freeze is active. The loader itself never writes to the old system.

**Safe-write outcomes (apply to every record and field, matched by the `legacy_id` mapping or natural key):**
| Case | Outcome |
|---|---|
| Target empty or absent | Populate it from the source |
| Target equals the source after normalisation | Skip; no write |
| Target non-empty and different | **Stop that customer's import** and write a conflict report (record, field, source value, target value, last modified, by whom). AJ decides per item (source wins, target wins, manual edit); the decision is recorded and a re-run applies only that decision |
Anything created or changed in the new system after import ("target-originated") is never touched by a re-run.

**Rollback safety:** each imported row is recorded in an import manifest with its batch id, import time and content hash. A rollback is first a dry run that sorts rows into **deletable** (carries the batch id, unchanged since import, and nothing created afterwards depends on it) and **retained** (modified, used, or referenced after import, for example a claimed membership, a payment, an order, a session). Only deletable rows can be removed, only after AJ approves the list; retained rows are never deleted and go to a review report. After a customer's first claim or any new-system activity the batch rollback no longer applies to the touched rows; recovery then means restoring the pre-import backup into a scratch database and a reviewed repair.
| ID | Test | Pass condition |
|---|---|---|
| M-01 | Existing business owners | Every legitimate owner established by the source (up to 3; AJ chooses if more) is claimed via O4 and becomes Owner by user id, one membership each. Each business ends with **at least one** verified Owner and never more than 3. Exactly one organisation per `businessId`. Unclaimed owners remain pending claims, not members. A business with two source owners ends with two Owners after both claim |
| M-02 | Existing staff | Each staff user arrives as a **type I2** invitation (14 days, section 3a) and becomes one membership with the mapped Caterly role at first login; an I2 not accepted within 14 days expires and is reissued only through the migration tooling |
| M-03 | One person in two businesses of the same product in the source (Revision 10, D15) | The loader detects it, reports it and stops for AJ's decision; it never merges or chooses silently; no second membership is created; no cross-leak. A person in two different products is allowed |
| M-04 | Multiple users in one business | Counts, roles and locations equal the source; no duplicates (also M-12) |
| M-05 | Subscription and autopay state | Plan, interval, period end, status and autopay status equal the source; snapshot regenerated |
| M-06 | Invoice history and numbering | Count and numbers equal; next number continues the sequence; PDFs reproduce |
| M-07 | Payment history and amounts | Count and rupee totals equal per customer and per month |
| M-08 | Historical operational data | Row counts per table, and sampled records compared field by field (orders, events, menus, inventory, customers) |
| M-09 | Changes in the old system during the window | Make changes after the first extract, re-run: only deltas apply, nothing duplicated, deleted-in-source items are reported not removed; or the agreed freeze is verified |
| M-10 | Duplicate and orphan records | Report lists every duplicate or orphan; the loader never invents or drops records to hide them |
| M-11 | Failed import | Force a failure on customer 2: it rolls back fully, customer 1 and 3 are untouched, rerun succeeds |
| M-12 | Individual customer rollback | Dry run splits rows into deletable and retained (see Rollback safety). Only deletable rows are removed after AJ approves the list. Test cases: untouched import rolls back fully; a membership claimed after import, a payment recorded after import, and an edited record are all retained and reported, never deleted; counts return to the starting state for deletable rows only |
| M-13 | Idempotency | A second full run changes nothing |
| M-14 | Safe write rule | The three outcomes hold: empty target is populated, matching target is skipped, conflicting non-empty target stops that customer's import with a conflict report and nothing is overwritten. Test cases for all three, plus a target-originated record that a re-run must not touch. Backups of every target database exist before any apply. Any destructive recovery needs an approved plan |
Per-customer report: before/after counts for users, memberships, businesses, customers, orders, events, menus, inventory, subscriptions, payments (count and rupees), invoices (count and last number), orphans, duplicates. Apply customer 1, verify with AJ, then customer 2, then customer 3; the old system stays authoritative until all three are verified and AJ approves.

## 13. Caterly `Member(userId, organizationId)` uniqueness (replaces F8.2.3)
**Revision 10 note (D15):** the rule is one membership per user per product, which is stricter than the `(userId, organizationId)` uniqueness this section audits. When the Caterly integration is separately approved, the audit in step a gains a second query (users with more than one membership in any organisation; local result 2026-11-04: 0 of 64) and the Caterly-side constraint target is reviewed then. Nothing in Caterly changes in W1.
| Step | Action | Rule |
|---|---|---|
**Required order. The local audit and resolution are a prerequisite for testing and for applying the migration anywhere.**
| Step | Action | Rule |
|---|---|---|
| a. Local audit (W0, read-only) | On a local copy of the dev database: `GROUP BY userId, organizationId HAVING count > 1` with role, `disabledAt`, `locationId`, created date and any references | No change to any data. Nothing below may start before a to c are complete |
| b. Report | Counts, ids and a proposed resolution per case, shown to AJ | Starts only after step a has completed successfully and its output exists (step a is in W0, step b in W1). Nothing is merged or deleted |
| c. Recovery plan | For any duplicates: AJ-approved manual consolidation script that first copies the affected rows to an archive table, produces a delete list for review, and is reversible | Never silent; never automatic |
| d. Local resolution and local migration test | Run the approved resolution on the local copy only; re-run the audit to show zero duplicates; then apply the expand-only migration (`-- data-safe-approved`) to that copy, run `npm run check:migrations`, test restore-based rollback, and run the affected Caterly specs individually | Not permitted before a to c. If the audit finds no duplicates, steps b and c are recorded as "no duplicates" and d still runs |
| e. AJ's local approval | AJ reviews the audit, the resolution and the local migration test, as part of the M1 local review (`F11.2.1`) | Gate to staging |
| f. Staging audit and migration | Fresh audit of staging data; resolve under the approved plan if needed; apply the migration inside the M1 staging rehearsal (`F11.3.1`) | Only after e |
| g. Production audit and migration | Fresh audit of production data shown to AJ; the migration is applied only as a separately approved production action (P2) | Only if the production audit shows zero duplicates, or after an approved recovery plan has been executed; otherwise do not apply |
Each environment is audited separately and freshly.

**Advisory-lock convention while the unique index is absent (in every environment where it has not yet been applied):** every code path that creates or updates a Caterly `Member` row must go through one shared helper, `withMemberLock(userId, organizationId, fn)`. The helper opens a transaction, takes `pg_advisory_xact_lock(hashtextextended('member:' || userId || ':' || organizationId, 0))`, looks up the existing `Member` for the pair, and inside `fn` updates or returns it instead of creating a second row; it creates only when none exists. The convention is delivered by new phase `F8.2.4` and covers:
| Path | Where it is today (found by code search) | How the lock is applied |
|---|---|---|
| Onboarding and provisioning | `src/modules/tenants/auto-provision.ts` (`tx.member.create`) | Wrap the create in the helper |
| Invitation acceptance | `src/app/invitations/[id]/accept/actions.ts` → `auth.api.acceptInvitation` (Better Auth creates the Member) | Our wrapper takes the advisory transaction lock on its own dedicated connection and **holds it for the full duration of the Better Auth operation**: the lock is acquired before `auth.api.acceptInvitation` is called, the transaction stays open until that call has resolved or rejected, and the lock is released only afterwards (rolled back in a `finally` on error, so it is never leaked). Better Auth runs on its own connection, so serialisation works because every caller of this pair goes through the helper. A second caller waits at the lock, then runs the call, sees the invitation already accepted and the Member already present, and receives a clean "already a member" result, not a server error. `F8.2.4` must prove it with the real-API concurrency test below |
| Team management | `src/modules/team/team.ts` (disable, enable, remove, set location) and `updateMemberRoleAction` → `auth.api.updateMemberRole` | Wrap each |
| Any other Better Auth call that writes a Member (for example organisation creation or add member) | First step of `F8.2.4` is a code search to list them; none are assumed | Wrap each found |
| New central paths: `organisation.link` receiver (`F8.2.2`), membership consumer (`F8.3.1`), central invitation acceptance (`F8.3.3`), O2/O4 owner sync | Built in M1 | Use the helper from the start |
Guard tests: a repository test fails if any file outside the helper calls `member.create`, `member.upsert`, `member.update` or `member.updateMany`, or calls a Better Auth API that writes Members, without the helper; two concurrency tests, both on a local copy of the database **without the unique index**, with real PostgreSQL and separate real connections, no mocks: (1) the eight-way test, 8 simultaneous accept, provision and sync attempts for one (user, organisation) pair, must leave exactly one `Member` row; (2) the **real Better Auth invitation test**: two simultaneous invitation acceptances for the same user and organisation, each through the real `auth.api.acceptInvitation` (via our wrapper, from two separate connections and two separate requests). Pass conditions: the final database contains exactly one `Member` row for the pair; neither request returns a server error (no 500, no unhandled unique or serialisation error, no intermittent failure over 50 repeated runs); one request completes the acceptance and the other returns the clean "already a member" outcome; and the lock is proven to cover the whole Better Auth operation, by recording timestamps around the real call in each request and asserting that the second call starts only after the first has finished (or by showing via `pg_locks` that the advisory lock was held while the Better Auth call was in flight). A control run without the wrapper is recorded for information only, to show the test can detect the race; it is not a gate. The convention stays until the unique index has been applied in all environments; it may remain afterwards as defence in depth.

## 14. Revised risk and decision register
**Decisions by gate:** see section 2. **Scope notes (please confirm):** S1 central invitations in M1; ~~S2~~ withdrawn (D15, no switcher); S3 marketing-site link changes in M2; S4 `subscription_items` design in M2, build in M3; **S5** (new) Ops gains a small read-only product-list endpoint in M1 (`F6.1.0`); **S6** (new) the per-user business creation cap is closed by D15: 1 per product.
| Type | Risk | Mitigation |
|---|---|---|
| Technical | Spike fails a must-have (discovery, PKCE, back-channel logout, claims) | Pass/fail rule; Logto fallback; Platform Core data layer is provider-independent so only F3.1.2/F4 are affected |
| Technical | `F1.2.1` token-claims schema written before D1 | Schema is provider-neutral (`sub`, email, verified, `membership_version`); reconciled in `F4.2.2` |
| Technical | `better-auth` upgrade (≥1.7.15) affects Caterly or Ops | Separate tested upgrade phase before `F8`; regression list |
| Technical | Session staleness after removal | Three-layer sync, ≤5 min bound, org-scoped revocation |
| Migration | Old-system data unknown until `F0.1.2` | Read first; M-01 to M-14; U=H on `F10.1` |
| Migration | Owner cannot be established without email | O4: AJ confirms each owner out of band; email only a one-time proof |
| Migration | Duplicate memberships block the unique index | Section 13 audit, report, plan, no silent merge |
| Migration | Hash incompatibility | Lazy reset path decided in `F2.1.2` |
| Security | Open redirect, token confusion, claim takeover | `F11.1.2` review, negative tests, secret plus verified email for claims |
| Security | Break-glass becomes a back door | Owner-only, 4 h expiry, audited, removable |
| Process | A phase or chunk reaching staging or production early | Section 1 rules; deploys happen only in milestone `F11.3`, `F15`, `F20` |
| Operational | One VPS, no staging, scripts never run on a real server | `F1.3` and `F11.3` rehearsals |
| External | Logto tenant (E1), old-system access (E2), staging access, Rivo timeline | Needed only at the phase named in section 2 |

## 15. Complexity changes
| Area | Change |
|---|---|
| F3 | Data layer now off the critical path; C stays L, U drops to M |
| F5.1.0, F6.1.0, F12.1.0, F16.1.0 | New, S/L |
| F6.1.3 | New, M/M (refresher, stale and deactivation handling) |
| F8.2.3 | Split into seven ordered steps (a to g), S/M overall |
| F8.2.4 | New, M/M (lock helper and wrapping existing paths) |
| F10.1.5 | New, M/H (depends on old-system data) |
| F9.2.2 | Narrower (existing flow only), M/M |

## What is already authorised, and what approval of this roadmap adds (applies to Revision 7 and subsequent revisions unless superseded)
| Status | Work |
|---|---|
| **Already authorised (before roadmap approval)** | Documentation (`F0.1.1`, `F0.1.2` once E2 is granted, `F0.1.3` decision questions, `F1.3.1` staging requirements and runbook as setup only) and the isolated identity spike on scratch code outside the repository (`F2`, local; Logto tenant only when E1 is granted) |
| **Authorised only after AJ's written approval of this roadmap** | Repository work in W0 and W1, all local: the `apps/platform` scaffold and local environment (`F1.1`, `F1.2`, CI for the new app), the read-only Member duplicate audit (`F8.2.3a`), the Ops product-list endpoint (`F6.1.0`), and the Platform Core data layer (`F3.1.1`, `F3.2`, `F3.3`, `F5.1.0`, `F6.1.1`, `F6.1.3`, `F6.3.2`, `F8.2.3b`) once their gates are closed |
| **Not authorised by any of the above** | Staging deployment of new code, production deployment, production authentication changes, billing cutover, customer migration. Each needs the gates in Part 1, section 15 (Permanent release process) and AJ's separate approval |

## Approved implementation deviations (recorded 2026-11-01, approved by AJ)
| # | Phase | Original wording | Approved deviation | Reason |
|---|---|---|---|---|
| 1 | `F1.2.1` | "zod schemas" | Hand-written parsers that return `{ ok, value | error }` and never throw, as in `packages/contract`. Zod is not introduced for this. Applies to `packages/platform-contract` and to the Ops product-list parser (`F6.1.0`, `packages/contract/src/platform.ts`) | Same idiom as the existing contract package; no new dependency in three apps |
| 2 | `F1.1.3` | Mail sink port not specified | Local mail sink on port **3600** (`scripts/local/mail-sink.mjs`), approved | Not one of the D14 ports; no clash |
| 3 | `F1.1.1` | none | `apps/platform/src/instrumentation.ts` is a temporary one-line stub. It exists only because, with the bundler root at the repository root, Next.js otherwise loaded the catering app's `src/instrumentation.ts` (Sentry) and the Platform dev server answered 500. Isolated to `apps/platform`; Caterly's Sentry and instrumentation are unchanged. To be replaced by Platform's own monitoring in `F10.2.2` | Accepted as temporary by AJ |

**END OF DOCUMENT (Revision 9). Last section: "What is already authorised, and what approval of this roadmap adds".**
