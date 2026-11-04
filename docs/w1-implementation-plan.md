# W1 implementation plan (planning baseline)

Recorded 2026-11-04. Revised 2026-11-04 after AJ's decisions on head-of-line delivery, last product link, the interim unlink signal and the scratch-database method. Companion to `docs/platform-foundation-plan.md` (Revision 10, section 0i and section 3b) and `docs/gate-b1-decision-record.md`.

**Nothing here authorises implementation, a database operation, a package install, a commit, a push or a deployment. Approval of this baseline is not approval to build.** No item below is done.

## 1. Scope and boundaries
| Rule | State |
|---|---|
| D15 slot constraint `UNIQUE (user_id, product_key)` | Only in the new Platform data layer (`apps/platform`) |
| Existing Caterly tables, login, authentication, kitchen settings, memberships, live workflows | Not modified in W1. Existing runtime behaviour unchanged |
| Multi-kitchen or multi-business switcher, S2, `F8.3.2` | Not reintroduced |
| Platform Core and Ops | Separate responsibilities as in Revision 10 (Ops owns the product registry) |
| D5 | Open. Blocks `F4.1.1` only |
| D1, D2, E1, E2 | Open or not given, and stay visible. Nothing is treated as complete |
| Caterly integration and migration | A separate final phase needing its own approval |
| **D15 is not globally enforced** | Live Caterly can still permit behaviour Platform rejects (a second organisation through the open Better Auth create route, the self-heal path). D15 may be called global only after the Caterly integration and migration are completed and verified |

## 2. Approved baseline decisions (AJ, 2026-11-04)
| # | Decision |
|---|---|
| C1 | `F8.2.4` split. **F8.2.4a** (W1): isolated helper, tests, baseline guard, new files only. **F8.2.4b** (Caterly phase): wrapping existing Member writes and the real Better Auth two-acceptances test |
| C2 | `organisation_products` is built in F3.2.1 because `membership_product_slots` references it by foreign key (plan deviation recorded) |
| C3 | F3.2.2 is "Product services and `lockOrganisation`", includes `linkProduct` and `unlinkProduct` as data-layer functions, with no signed sender (`F6.1.2`) |
| C4 | Audit and outbox: tables in F3.2.1; transaction-safe writers before F3.2.2; delivery worker after F3.2.2 |
| C5 | F3.1.1 provider-neutral: no credentials, no authentication configuration |
| C6 | `users.id` is a `uuid` (conditions in section 5) |
| C7 | O1 selects and links the product in the same transaction; no organisation without a link; linking checks every existing member |
| C8 | A disabled member keeps the slot; only removal frees it; unlinking deletes that product's slots and keeps the membership |
| C9 | Caterly enforcement gap acknowledged, not fixed in W1 |
| C10 | `platterly_platform_test` and the Caterly scratch database are in the plan but **not created**; no database creation, data copy or migration without separate approval |

## 3. Dependency graph and order
```
F8.2.3b ──────────────────────────────┐ read-only, independent
F8.2.4a ──────────────────────────────┤ new files only, independent
F3.1.1 users ─► F3.2.1 tables ─► W1-B writers ─► F3.2.2 services ─┬─► F3.2.3 permissions
                                                                  ├─► F3.3.1 audit completeness check
                                                                  └─► F3.3.2 delivery worker (W1-C)
```
| Step | Item | Why here |
|---|---|---|
| 1 | F8.2.3b | Read-only |
| 2 | F8.2.4a | Proves the lock pattern with no Caterly change |
| 3 | F3.1.1 | Everything references `users` |
| 4 | F3.2.1 | All tables in one migration group |
| 5 | W1-B writers | F3.2.2 must write audit and outbox in its own transaction |
| 6 | F3.2.2 | Core services |
| 7 | F3.2.3 and F3.3.1 check | Independent of each other |
| 8 | F3.3.2 (W1-C) | Needs real events to deliver |

Plan deviations to record in Revision 10 when implementation is approved: (1) `organisation_products` in F3.2.1; (2) audit and outbox tables and writers ahead of F3.2.2; (3) F8.2.4 split with part a in W1; (4) a dead-lettered outbox event stays a delivery blocker until recovery is confirmed or an audited resolution is made (plan section 12 says the event is "parked" after 7 days and the layer-2 pull and reconciliation close the gap; this baseline does not let later events pass until the blocker is resolved); (5) a tombstone table for product unlinks and a `link_established` flag, to support the last-link rule and organisation-level reconciliation.

## 4. Items
### F8.2.3b Member audit follow-up
Files: `docs/member-duplicate-audit-results.md` (addendum), `scripts/member-duplicate-audit.sql` (second read-only query: users with more than one membership). Read-only on a copy. Acceptance: counts, method, verdict; AJ accepts. Local result so far: 64 users, 0 with more than one membership.
**Status 2026-11-04: Accepted by AJ** (run on `platterly_dev_audit_f823a`, 14:07 IST snapshot; 43 membership records, 0 orphans, 21 users with no membership). Staging and production were not checked. Procedural notes are in the audit report.

### F8.2.4a `withMemberLock`, helper, tests, baseline guard
Files, all new: `src/lib/member-lock/with-member-lock.ts`, `src/lib/member-lock/known-member-writes.json`, `src/lib/member-lock/__tests__/with-member-lock.test.ts`, `src/lib/member-lock/__tests__/member-write-guard.test.ts`. No existing file changes. See clarification A for isolation.

**Status 2026-11-04: Accepted by AJ** (see the acceptance note before section 11). Final scope: `src/lib/member-lock/with-member-lock.ts`, `known-member-writes.json`, `__tests__/with-member-lock.test.ts`, `__tests__/member-write-guard.test.ts`, plus two files beyond the plan's four: `__tests__/scratch-target.ts` (target guard) and `__tests__/scratch-target.test.ts` (its refusal tests). The original file list above is kept as planned.

### F3.1.1 users, identities, legacy mapping (provider-neutral)
Files: `apps/platform/prisma/schema.prisma`, one migration, `src/modules/users/`, tests.
| Table | Columns and constraints |
|---|---|
| `users` | `id uuid` (`gen_random_uuid()`), `email` stored lower-case with `CHECK (email = lower(email))` and unique, `status`, `email_verified_at`, timestamps |
| `user_identities` | `user_id` FK **ON DELETE RESTRICT**, `provider` text, `subject` text, `UNIQUE (provider, subject)`, `UNIQUE (user_id, provider)` |
| `legacy_mappings` | `source_system`, `kind`, `legacy_id` text, `user_id` FK RESTRICT, batch id, `UNIQUE (source_system, kind, legacy_id)`, `UNIQUE (user_id, source_system, kind)` |
No credential, password or provider-specific column. Tests: case-insensitive duplicate refused, one identity per provider, legacy id maps once, no foreign key on email.

### F3.2.1 tables
| Table | Constraints |
|---|---|
| `organisations` | id `biz_<32hex>` format `CHECK`; `status`; `ownership_locked`; `membership_version`; `outbox_sequence bigint`; `owner_established boolean default false`; import batch id |
| `organisation_members` | `organisation_id` FK RESTRICT, `user_id` FK **RESTRICT**, role `CHECK` (owner, admin, manager, member), status `CHECK` (active, disabled, removed), `UNIQUE (organisation_id, user_id)`, `UNIQUE (id, organisation_id)`; `organisation_id` immutable |
| `organisation_products` | `PK (organisation_id, product_key)`, `product_key` format check (`isProductKey` rule), status. W1 validates format only; the foreign key to `product_integrations` is added expand-only in `F6.1.1` |
| `membership_product_slots` | `user_id`, `product_key`, `organisation_id`, `member_id`; **`UNIQUE (user_id, product_key)`**; FK `(organisation_id, product_key)` to `organisation_products` ON DELETE CASCADE; FK `(member_id, organisation_id)` to members ON DELETE CASCADE |
| `organisation_creation_requests` | see O1 |
| `organisation_product_unlinks` (tombstones) | `id uuid`, `organisation_id` FK RESTRICT, `product_key`, `unlinked_at`, `organisation_sequence`, `unlinked_by`, `relinked_at` null. Written by `unlinkProduct`, never deleted. Lets reconciliation tell "unlinked" from "never linked" (clarification D) |
| `organisations.link_established` | boolean default false; set true by an immediate trigger when the first `organisation_products` row is inserted; cannot go back to false. Supports the last-link rule. Organisations adopted or imported with no link are allowed until their first link (O1 always creates one) |
| `audit_logs` | table only here. `organisation_id` nullable, FK RESTRICT; update and delete blocked by trigger |
| `outbox_events` | table only here. Columns include `event_id` (unique), `organisation_id`, `product_key` (text, no foreign key), `event_type`, `payload`, `sequence`, `status` (`pending`, `delivered`, `dead`, `resolved`), `attempts`, `next_attempt_at`, `locked_until`, `last_error`, `delivered_at`, and for resolution: `resolution` (`replayed`, `reconciled`, `waived`), `resolved_at`, `resolved_by`, `resolution_evidence` (JSON). Payloads are never purged while the event is `dead` |
Removed member rows keep history and hold no slot. Re-adding reactivates the same row; the slot unique decides whether that is allowed. Foreign-key dependency (C2): a slot cannot exist without its `organisation_products` row, so that table must be created first.

### W1-B transaction-safe writers (no delivery)
`src/modules/audit/write-audit.ts`, `src/modules/outbox/enqueue.ts`. Both take the caller's `tx`; neither opens a transaction or touches the global client. Audit `organisation_id` nullable (user-level events). Redaction test fails on keys matching secret, token, password, otp or hash. Sequence allocation: clarification C.

### F3.2.2 Product services and `lockOrganisation`
Files: `src/modules/organisations/{lock,create,members,products,status}.ts`, tests. `lockOrganisation(tx, id)` is `SELECT … FOR UPDATE` on the organisation row. It records the organisation in the transaction and throws if a different organisation is locked later: **one transaction changes one organisation** (deadlock rule, clarification B2). Functions: `createOrganisation` (O1), `adoptOrganisation`, `addMember` (includes reactivation), `removeMember`, `changeRole`, `disableMember`, `enableMember`, `linkProduct`, `unlinkProduct`, `setStatus`. No signed sender.

**O1 idempotency table `organisation_creation_requests`:** `id uuid`, `user_id` FK, `idempotency_key` text (8 to 100 chars), `request_hash` (sha256 of normalised name and product key), `organisation_id` FK, `created_at`; **`UNIQUE (user_id, idempotency_key)`**. One transaction: verify `email_verified_at`; `INSERT … ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING`; mint `biz_…`; insert organisation; insert `organisation_products` (required); check all existing members against the product's slots (none exist yet); insert Owner member and its slot (the owner trigger sets `owner_established`); audit; outbox. Same key concurrently: the second insert waits on the first's uncommitted row; if the first commits the second returns the stored organisation (different `request_hash` is an error); if it rolls back the second proceeds. Different keys concurrently: the second blocks on `UNIQUE (user_id, product_key)`, then fails `SlotTaken` and rolls back whole. Rate limiting needs a request layer and is not W1.

**`linkProduct`:** lock; for every member whose status is not `removed` (active and disabled), insert a slot; if any slot is taken elsewhere, refuse the whole link and report a count only; audit; enqueue.

**`unlinkProduct`:** clarification D.

### F3.2.3 permission map
`src/modules/organisations/permissions.ts` and tests. Typed map of the section 4 actions with a `requiresFreshAuth` flag on every Owner-only action. Full matrix: 4 roles × every action × own and other organisation × removed, disabled and non-member callers. Admin cannot touch Admin or Owner. No Caterly sensitive key reachable. Real `max_age` enforcement needs session auth time, so it waits on D1/D2 and F4; W1 tests the predicate with a supplied timestamp and does not claim fresh authentication is enforced.

### F3.3.1 audit completeness check
A test enumerates the F3.2.2 functions and fails if one changes state without writing exactly one audit row. Update and delete on `audit_logs` are blocked by trigger.

### F3.3.2 outbox delivery worker (W1-C)
`src/modules/outbox/deliver.ts` and a cron route under `src/app/api/cron/` (read `node_modules/next/dist/docs/` first, per CLAUDE.md). Injected sender. Behaviour: clarification C. Real signed delivery to a product is not claimed; it is checkpoint IC1 in W3.

## 5. User id format (C6)
`users.id` is a Postgres `uuid`, serialised as lowercase hyphenated text (36 characters). `packages/platform-contract` accepts `userId`, `ownerUserIds` and token `sub` as any non-empty string up to 100 characters, so it is compatible, and the contract package is not modified. All Platform foreign keys use `uuid`. Caterly user ids are opaque text (28 to 36 characters) stored only in `legacy_mappings.legacy_id`. Products must treat `userId` as opaque. A typed prefix would be a contract change for AJ to approve later.

## 6. Invitations: actual scope
W1 has no invitation table or service. Invitations are `F5.2.1` (needs `F3.2.2`, `F4.1.1` and so D1, and D5 for email). `membership_product_slots` does not enforce invitation uniqueness; it enforces one membership per user and product when a member is added by any route. W1 therefore tests only concurrent membership creation through `addMember`. The one-pending-invitation race test and its constraint (partial unique index on `(organisation_id, lower(email))` where pending, superseding competing invitations for the same product on accept) belong to `F5.2.1`.

## 7. Migration and rollback
| Rule | Detail |
|---|---|
| Migrations | Additive and reviewed; `npm run check:migrations` covers Platform, and new tables need no approval line |
| Reversal | Each migration has a reviewed `down.sql` in `apps/platform/prisma/rollbacks/` (outside the Prisma migrations folder), never run automatically |
| Tests | On a disposable `platterly_platform_test`, built from scratch with `migrate deploy` and dropped between runs; an up, down, up round trip is tested there |
| Real data later | `down.sql` applies only to empty or test data. After real data exists, correct with a forward-fix migration. A dump restore is a last resort, not the default |
| Dev database | `platterly_platform` is migrated only after the disposable run passes, and only on AJ's approval |

## 8. Clarifications recorded 2026-11-04
### A. F8.2.4a test isolation
| Question | Answer |
|---|---|
| What is tested | `withMemberLock(db, userId, organizationId, fn)` against the real Caterly `member` table definition, with separate connections and controlled concurrency |
| Lock and write share a transaction | The helper opens one interactive transaction, first runs `pg_advisory_xact_lock(hashtextextended('member:'||userId||':'||organizationId, 0))`, then calls `fn(tx)`. `fn` receives only `tx`, so every protected write uses the lock's connection. The lock is transaction-scoped: PostgreSQL releases it on commit, rollback or connection loss. No `finally` is involved. The risk is a write that escapes through the global client; the signature and a test cover it. The helper sets an explicit transaction timeout |
| Schema required | Tables `user`, `organization`, `member` (and what their foreign keys need). `member` deliberately has **no** unique `(userId, organizationId)`, which is the real Caterly state and the point of the test |
| How it is reproduced | **Approved method:** a new, empty scratch database (name contains "test") built by running the committed root migrations with `prisma migrate deploy`, passing an explicit URL on the command line for that one command only (no `.env` edit). That is schema plus whatever the migrations seed, and **no customer or development rows**. It never contacts the original database |
| Pre-flight schema verification (before any test is written against it) | (1) Run `DATABASE_URL=<scratch> npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (corrected 2026-11-04: Prisma 7.10.1 has no `--from-url`; the original wording was `--from-url <scratch> --to-schema-datamodel …`); any difference means the migrations do not produce the schema Prisma expects. (2) Assert in a setup script that `user`, `organization` and `member` have the columns and constraints the helper tests rely on, that `member` has **no** unique constraint on `(userId, organizationId)`, and that the foreign keys from `member` to `user` and `organization` exist. (3) Assert those three tables hold 0 rows and record row counts of every other table. **If any check fails, stop and report the exact difference. Do not continue** |
| Fallback | **None automatic.** There is no fallback to `pg_dump` against the original database. That would need AJ's separate approval, and no row would be copied in any case |
| Guards against touching the original | The tests read `MEMBER_LOCK_TEST_DATABASE_URL`, never `DATABASE_URL` or `.env`. If it is unset, the concurrency tests skip, so the default `npm run test` (which runs against `platterly_dev`) never executes them. At start they verify `current_database()` contains "test" and that `user`, `organization` and `member` are empty, and refuse otherwise. Fixture ids carry a `lock-test-` prefix |
| Client | The test creates its own `PrismaClient` and `pg` pools for the scratch URL. `src/lib/db.ts` is not touched. The generated client is only read |
| Existing files and behaviour | Only new files. Nothing imports them, so there is no runtime change. They do join the repo-wide typecheck and lint, which must stay clean. The baseline guard only reads source files |
| Tests | Control: naive check-then-insert from 8 separate connections behind a barrier produces more than one row (proves the race). Helper: the same 8 workers leave exactly one row. Blocking: transaction 1 holds the lock, transaction 2 is seen waiting in `pg_locks`, then proceeds after commit. Release on rollback: `fn` throws, the rollback frees the lock, transaction 2 proceeds at once. Independence: different pairs do not block. Guard: a static scan fails on a new `member.create|update|delete|upsert` outside `known-member-writes.json`, without requiring existing code to use the helper |
| Not done here | The real Better Auth invitation-acceptance concurrency test (F8.2.4b) |
| Approvals | Creating the scratch database, running `migrate deploy` into it, running the verification above, and dropping it later (dropping needs asking, per AJ's standing rule). No data copy is proposed |

### B. Owner invariants (design review)
Definitions: an **active owner** is `role = 'owner'` and `status = 'active'`. The cap counts **non-removed** owners (active or disabled), so a disabled owner cannot be re-enabled into a fourth. The floor counts **active** owners only.

| Element | Specification |
|---|---|
| `owner_established` | Set by an immediate trigger when a member row becomes an active owner (the service does not set it). A second trigger forbids it going from true to false. An organisation created or adopted with no members stays `false` and may be ownerless by design until its first owner is added (O2, O4) |
| Deferred check | `CONSTRAINT TRIGGER … AFTER INSERT OR UPDATE OR DELETE ON organisation_members DEFERRABLE INITIALLY DEFERRED`, per row, calling a function that (1) first takes `SELECT … FROM organisations WHERE id = … FOR UPDATE`, (2) then requires non-removed owners ≤ 3, (3) requires active owners ≥ 1 when `owner_established`. If the organisation row no longer exists the function returns |
| Why the row lock inside the trigger | Without it two concurrent transactions each demoting a different owner would each see the other owner still active in their own snapshot, both pass and commit with zero owners (write skew). With the lock, the second transaction waits for the first to commit, then its count query (a fresh statement snapshot at READ COMMITTED) sees the first change and raises. The services already hold the same row lock, so the trigger lock is a backstop for any path that skipped `lockOrganisation` |
| Isolation | Default READ COMMITTED must not be lowered or changed. Under REPEATABLE READ or SERIALIZABLE the same situation raises a serialisation error instead, which is also safe |

Walk-through of every operation:
| Operation | Result |
|---|---|
| Adoption (organisation, no members) | No member row, trigger does not fire; `owner_established` false; allowed |
| Non-owner members added to an unclaimed organisation | Allowed; the floor does not yet apply |
| First owner (O1, O2, O4 consumption) | Immediate trigger sets `owner_established`; commit check: 1 owner ≤ 3, active ≥ 1 |
| Add owner when 3 non-removed owners exist | Rejected at commit, and earlier by the service count |
| Ownership transfer (O3) where the cap is full | Add target and step down or remove initiator in **one** transaction; the intermediate state may exceed 3 because the check is deferred; the final state is valid. The service counts the final state |
| Concurrent demote or remove of two owners | Serialised by the service lock; with the lock skipped, serialised by the trigger's lock; the second fails |
| Five concurrent add-owner calls | Exactly 3 owners result; the later commits fail |
| Disable an owner | Counts as leaving the active set; floor applies; the cap still counts them |
| Re-enable a disabled owner | Cap already counted them; no change to the cap |
| Hard delete of a member row | `AFTER DELETE` trigger uses the old row; same checks |
| Role change to or from owner | `UPDATE` trigger; same checks |
| Move a member to another organisation | Refused: `organisation_id` is immutable |
| Delete a user who is an owner | Refused: `user_id` foreign key is RESTRICT |
| Dispute or lost-access recovery (section 12) | Add the new owner first, then remove the old one (same transaction if the cap is full); never passes through zero |
| Organisation row deleted (staff, manual) | Members cascade; the trigger function finds no organisation and returns |

Conclusion: by design, no valid operation can leave an **established** organisation with zero active owners or more than three non-removed owners. This is a design result, not yet proven by running code. The tests in F3.2.1 and F3.2.2 (constraint tests plus the barrier-synchronised concurrency tests above, including one that deliberately skips `lockOrganisation`) are what prove it. Residual bypasses, outside any valid operation: a superuser or table owner disabling triggers (`ALTER TABLE … DISABLE TRIGGER`, `session_replication_role = replica`), and direct SQL by staff with such rights. Pending-claim counts toward the plan's "owners plus pending claims ≤ 3" limit are enforced in `F5.1.1` (claims are not in W1).

#### B2. Required owner-invariant test plan (strengthened 2026-11-04)
All run on `platterly_platform_test` with **separate database connections** (each worker its own client; the test asserts distinct `pg_backend_pid()` values) and a barrier so the transactions genuinely overlap.
| # | Requirement | Tests |
|---|---|---|
| 1 | Concurrent demotions and removals | Two owners demoted at once; two owners removed at once; one demoted and one removed; owner disabled while another is removed. Exactly one commit succeeds in each case and at least one active owner remains |
| 2 | Actual isolation level | Platform sets no isolation level (`src/lib/db.ts` uses the default `PrismaPg` adapter), so transactions run at PostgreSQL's default, READ COMMITTED. A test asserts `SHOW transaction_isolation` inside every service transaction equals that value, so a future change breaks the test. The concurrency cases are also run under explicit REPEATABLE READ and SERIALIZABLE to document the outcome: expected is a serialisation error (SQLSTATE 40001), never an invalid commit |
| 3 | Adoption and first-owner establishment | Adopted organisation with no members commits; non-owner members only commit; first owner sets `owner_established` even when the service omits it; two concurrent first-owner inserts; the flag cannot be reset to false; an established organisation cannot be driven to zero active owners; an unestablished one may be ownerless |
| 4 | Disable, re-enable and transfer at three owners | 3 owners, disable one, add a fourth non-removed owner: rejected (cap counts disabled). Remove the disabled one, then add: allowed. Re-enable: cap unchanged. Transfer at the cap in one transaction (add target, remove or demote initiator): allowed. Transfer where the initiator stays: rejected. Concurrent transfer plus add-owner at the cap: cap holds |
| 5 | Hard deletion and cascade | Hard delete of the last active owner of an established organisation: rejected at commit. Hard delete with another active owner: allowed. Deleting an owner's user: refused (RESTRICT). Deleting an organisation cascades its members, slots and links with no trigger error and no orphan. Deleting a link cascades its slots. Deleting a member cascades its slots |
| 6 | Zero active owners after establishment | A seeded, repeatable randomised sequence of add, remove, disable, enable, role change and delete operations from several connections; after every commit the test asserts, for every established organisation, active owners ≥ 1 |
| 7 | Cap holds when the service lock is bypassed | Several connections insert or promote owners with raw SQL, taking no `lockOrganisation`: non-removed owners never exceed 3, and a rejected transaction raises at **commit** (the test confirms the error reaches the caller and cannot be mistaken for success) |

**Isolation and deadlock limitations (documented, not assumed away)**
| Item | Position |
|---|---|
| READ COMMITTED dependence | Correctness of the floor check relies on the trigger first taking `FOR UPDATE` on the organisation row, then counting in a new statement. Under READ COMMITTED the count sees the other transaction's committed change. Under REPEATABLE READ or SERIALIZABLE the same situation raises a serialisation error (safe, but callers need a bounded retry). Platform must not lower isolation below READ COMMITTED |
| Error timing | The deferred trigger raises at COMMIT. The service must map that error to a domain error and must not treat `fn` returning as success. Tested in item 7 |
| Deadlock: one organisation per transaction | The trigger takes the organisation lock at commit while the transaction may already hold slot-index and member-row locks. A transaction touching **two** organisations could deadlock. Rule: one transaction changes one organisation. `lockOrganisation` records the organisation in the transaction and throws if a second, different organisation is locked. Test included |
| Deadlock: bypass path | A bypass transaction B has updated member row M and waits at commit for the organisation lock that service transaction A holds while A waits for M. PostgreSQL detects this (SQLSTATE 40P01) after `deadlock_timeout` and aborts one transaction. The invariant is not violated but one request fails. Only arises when the service lock is skipped. A test asserts exactly this outcome |
| Row-level deferred trigger cost | It runs once per changed row at commit. Acceptable at these sizes; a statement-level variant is an option if bulk member changes ever appear |
| Privilege | In local development the application role owns the database and can disable triggers. Production must use a separate migration role and a runtime role with data-change rights only; recorded as a requirement for `F10.2.1` |
| Residual bypasses | A superuser or table owner disabling triggers (`ALTER TABLE … DISABLE TRIGGER`, `session_replication_role = replica`), and direct staff SQL with such rights |


### C. Outbox sequence
| Topic | Behaviour |
|---|---|
| Allocation | `UPDATE organisations SET outbox_sequence = outbox_sequence + 1 WHERE id = $1 RETURNING outbox_sequence`, inside the caller's transaction and under the organisation row lock. It is a row update, not a PostgreSQL `SEQUENCE` object |
| Commit | The new value and the event row commit together |
| Rollback | The increment rolls back with the event. No number is consumed. A PostgreSQL `SEQUENCE` would leave gaps, which is why it is not used |
| Concurrent transactions | The second `UPDATE` waits until the first commits or rolls back, then reads the committed value and increments it. Because the lock is held to commit, **sequence order equals commit order** |
| Gap-free | Gap-free applies to **committed** events of one business, at allocation. It does not mean a given product sees contiguous numbers |
| Per-product streams | An event row exists per (event, product) with the business's number. A product linked alongside another therefore sees increasing but non-contiguous numbers. **Consumers must not treat a gap as loss.** They only ignore numbers not greater than the last applied (`packages/platform-contract/src/sequence.ts`); loss is covered by the `membership_version` pull and daily reconciliation (plan section 12) |
| Request retries | A retried request either replays the stored idempotent result (no new event) or, after a serialisation failure, re-runs as a new transaction (new allocation). Neither reuses a rolled-back number |
| Delivery retries | The same row is re-sent with the same event id and the same sequence; the consumer ignores the repeat |
| Uniqueness | `UNIQUE (event_id)` and `UNIQUE (organisation_id, product_key, sequence)` |
| Ordering by the worker (approved) | **Head-of-line per (organisation, product).** The worker never delivers sequence N+1 while any earlier event for that pair is `pending` or `dead`. Events are per-change deltas, so a late N would be dropped by a consumer as old and a change would be lost |
| Claiming | An `UPDATE … SET locked_until = now() + 60 s, attempts = attempts + 1` using `FOR UPDATE SKIP LOCKED`, picking the lowest `pending` sequence per pair whose `next_attempt_at` has passed **and for which no earlier event of that pair is `pending` (in retry) or `dead`**. The HTTP call happens outside any transaction; a crashed worker's lease expires and the row is retried |
| Failure and dead letter (revised) | Backoff 1 min, 5 min, 30 min, 2 h, 12 h, 24 h for 7 days. After that the event becomes `dead`. **A `dead` event stays a delivery blocker.** Later events for that pair are not delivered. Nothing skips it automatically and nothing is purged. Staff are alerted (alerting arrives in a later phase; W1 exposes the blocked-pair query and its tests) |
| Releasing a dead blocker | Only one of three audited actions, each by a named staff actor with a reason: **`replayed`** (reset attempts and try again); **`reconciled`** (recovery confirmed, see next row); **`waived`** (staff decision that the event is not needed, with the reason recorded). Each writes an audit row and sets `resolution`, `resolved_at`, `resolved_by` and `resolution_evidence`, then status `resolved`. A `waived` resolution also marks the pair as needing reconciliation before it is described as healthy |
| Reconciliation evidence | Recovery is confirmed only by evidence from the product, never by Platform's own belief: the product's reported last-applied sequence for the business (or its applied `membership_version`) is at least the dead event's. W1 builds the comparison as a pure function plus the resolve service and tests both with supplied evidence. **The product-side report and the pull API are not built in W1** (`F6.2`, `F8`), so real reconciliation is not claimed |
| Consequences to watch | A dead blocker grows a backlog for that pair, so the blocked-pair query reports its age and depth. Events remain in sequence; none is reordered. The retry and recovery design in the Foundation Plan (section 12) is superseded for this point by deviation (4) |
| Unacknowledged delivery | If the product applied the event but the acknowledgement was lost, the resend is harmless |
| Held events | Suspended integrations (`F6.1.1`) hold events for up to 30 days without dead-lettering; not built in W1 |

**Outbox tests (W1-C):** allocation under commit, rollback and concurrent transactions; head-of-line (a pending N blocks N+1); backoff timing; a `dead` event blocks later events and nothing releases it automatically; each of `replayed`, `reconciled` and `waived` releases the block, requires an actor and reason, writes an audit row and rejects a missing or insufficient evidence value; resolving races with a worker claim; two workers never claim the same row; lease expiry after a crash; a duplicate send is harmless. Fake sender only.

### D. Product unlinking (`unlinkProduct`), revised
One transaction, in this order. Any failure rolls all of it back, including the sequence allocation.
| Step | Action |
|---|---|
| 1 | `lockOrganisation` (row lock, `SELECT … FOR UPDATE`) |
| 2 | Load the `organisation_products` row. If absent, return `changed: false` with no audit, outbox or tombstone (idempotent) |
| 3 | **Last-link rule (approved):** count the organisation's links **under the lock**. If this is the last one, refuse with a domain error. Because the lock serialises unlinks of one organisation, two simultaneous requests cannot both see "two links" |
| 4 | Read the affected slots (member ids and count) |
| 5 | Write **one audit row** before any delete: action `product.unlinked`, actor, `before` = link status, slot count and member ids (ids only, no emails), `after` empty. `audit_logs` has no foreign key to links or slots and its organisation foreign key is RESTRICT, so history survives |
| 6 | Allocate a sequence and enqueue one `membership.changed` (status `removed`, bumped `membershipVersion`) per affected member, addressed to that product only. Outbox rows carry `product_key` as text with no foreign key to the link, so they survive its removal |
| 7 | Insert the tombstone row in `organisation_product_unlinks` (with the organisation sequence and actor) |
| 8 | Explicitly delete the product's slots, then the `organisation_products` row. The composite foreign key cascade is the backstop, so a slot can never outlive its link, even for direct SQL |
| 9 | Bump `membership_version` once |
| 10 | Do **not** touch `organisation_members`: roles, statuses (including disabled) and owner counts are unchanged, so the owner trigger is not involved |
| 11 | Commit |

**Database backstop for the last-link rule (bypassing the service lock):** a deferred constraint trigger on `organisation_products` (`AFTER DELETE`, per row) takes `FOR UPDATE` on the organisation row, then, if `link_established` is true and the organisation still exists, requires at least one remaining link, else raises at commit. Same design and the same limits as the owner trigger (READ COMMITTED dependence, error at commit, one organisation per transaction, trigger-disabling privileges).

**Concurrency tests for the last link (separate connections, barrier):**
| Test | Expected |
|---|---|
| Organisation with exactly two links, two simultaneous unlinks of different products | Exactly one succeeds, the other is refused, one link remains |
| Three links, three simultaneous unlinks of different products | Two succeed at most, the last is refused, at least one link remains |
| Two simultaneous unlinks of the same product | One changes the state, the other returns `changed: false`, no duplicate audit, outbox or tombstone |
| Single link, any unlink | Refused |
| The same races with raw SQL deleting links **without** the service lock | The trigger leaves at least one link; the losing transaction fails at commit |
| Unlink racing `linkProduct` of a different product in the same organisation | Serialised by the lock; the final state has at least one link |
| Organisation deleted by staff | Links and slots cascade; the trigger finds no organisation and does not fail |

**Interim unlink signal and its limits (approved conditionally):**
| Topic | Position |
|---|---|
| What W1 sends | Per-member `membership.changed` events (status `removed`) to the unlinked product, in sequence (step 6). No new shared contract event is introduced in W1 |
| Known contract limitation | **Per-member events do not fully communicate an unlink.** A product with **zero** affected members receives nothing. A product that does receive them cannot tell "unlinked" from "member removed from the business", because `membership.changed` has no link-level meaning. This baseline does not claim otherwise |
| Organisation-level reconciliation requirement | Each product must periodically (at least daily, and on demand) ask Platform for the **authoritative link state** of every business it believes is linked, and reconcile locally. The query is signed and keyed by `businessId` and `product_key`; it answers `linked`, `unlinked` (with `unlinked_at` and the organisation sequence) or `never_linked` |
| How the missing link is detected | The answer is computed from two tables: a current `organisation_products` row means `linked`; otherwise the latest tombstone means `unlinked`; otherwise `never_linked`. The tombstone is what lets a zero-member product learn that its link was removed instead of receiving a not-found. A relink sets `relinked_at` on the tombstone and recreates the link row |
| What W1 builds | The tombstone table, a data-layer function `getLinkState(organisationId, productKey)` and its tests. Not built in W1: the signed pull endpoint, the batch query, and the product-side job. They need a **contract change** (a link-state query or field, since the existing membership-version pull does not carry link state) which is for AJ to approve at `F6.2`/`F8`, and the pull API from `F6.2` |
| Until then | A product with zero members will not learn of an unlink. This is a known limitation, to be listed as open in the checklist |

Behaviour around it:
| Case | Behaviour |
|---|---|
| Pending outbox events for that product from before the unlink | Kept and delivered in order (subject to head-of-line and dead-letter blocking), followed by the removal events. No new events for the product are generated afterwards |
| Concurrent `addMember` on the same organisation | Serialised by the organisation lock; after the unlink it creates no slot for that product |
| Concurrent `linkProduct` of the same product in **another** organisation for a shared member | It blocks on the unique index while the unlink's delete is uncommitted, then succeeds after commit |
| Relinking later | `linkProduct` rechecks every non-removed member. **Consequence:** unlinking releases the slots, so a member may take that product's slot elsewhere, and relinking the original organisation is then refused. Staff must be shown this before an unlink |
| Ops | Platform unlinking does not change Ops entitlements or billing |

Other tests: slots for that product are gone and other products' slots intact; memberships, roles and statuses unchanged; a disabled member's slot is removed on unlink and restored on relink only if free; one audit row with the right counts that still exists after the link is gone; events enqueued in order; injected failure at each step leaves no partial state; tombstone written and `getLinkState` answers correctly through unlink and relink.

## 9. Confirmed decisions and approvals still needed
Confirmed by AJ on 2026-11-04: head-of-line delivery with a dead letter that keeps blocking (section 8C); no unlink of an organisation's last link, enforced under the lock (8D); per-member `membership.changed` as the interim unlink signal with an organisation-level reconciliation requirement and no new contract event in W1 (8D); scratch database from committed root migrations with a mandatory schema check and no automatic `pg_dump` fallback (8A).

| Still needs | Detail |
|---|---|
| AJ's approval to create `platterly_platform_test` and the Caterly scratch database | Separate approval each. No data copy |
| AJ's approval to run any migration on any database | Including the dev `platterly_platform`, after a clean disposable run |
| AJ's approval to run the schema verification on the scratch database | Part of the scratch approval |
| AJ's approval to implement | None of this baseline authorises building |
| Cron route code (read Next docs first) | Implementation approval |
| Any commit, push or CI run (`F1.3.2`) | Separate approval |
| Link-state query or field for reconciliation (contract change) | AJ's decision at `F6.2`/`F8`, outside W1 |
| Production database roles (migration versus runtime) | Before `F10.2.1` |
| Caterly integration, `F8.2.4b`, closing the Better Auth create route, the Caterly constraint, E2 data | Their own phases |

## 10. Unresolved decisions and external dependencies
D5 (open; blocks `F4.1.1`), D1 and D2 (Gate B-2; block `F3.1.2`, F4 and real fresh-auth enforcement), E1 (not given; blocks `F2.1.4`), E2 (not given; blocks `F0.1.2`, O4 and `F10.1.1`), product-key validity before `F6.1.1` (format check only), `F6.1.0` review and first real secret rotate (block `F6.1.3`).

### Implementation-preparation note, 2026-11-04: F8.2.4a scratch database (AJ approved the setup and the corrections)
| Item | Record |
|---|---|
| Database | `platterly_member_lock_test`, owner `platterly_app`, local Homebrew PostgreSQL 16.15, `localhost:5432`. Created with AJ's approval; no data copied; no roles, grants or extensions added |
| Migrations | **90** committed root migrations (not 91: the extra file once counted was `migration_lock.toml`). All 90 applied successfully with `prisma migrate deploy`; migration history shows 90 finished, 0 rolled back |
| Schema comparison | `DATABASE_URL=<scratch> npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` returned **exit code 0** ("No difference detected") |
| Empty tables | `user`, `organization` and `member` hold 0 rows. `member` has no unique constraint or index on `(userId, organizationId)` (only its primary key on `id`). Non-empty tables: `_prisma_migrations` (90) and `system_food_category` (10 seeded reference rows, not customer data) |
| Not done | `withMemberLock`, test files, concurrency tests. The database is not dropped; dropping needs separate approval |
| Plan text | The sections above keep their original decisions. Only the unsupported `--from-url` command in clarification A was replaced, as marked there |

### Acceptance note, 2026-11-04: F8.2.4a accepted by AJ
| Item | Record |
|---|---|
| Scope delivered | `src/lib/member-lock/with-member-lock.ts`, `known-member-writes.json`, `__tests__/with-member-lock.test.ts`, `__tests__/member-write-guard.test.ts`, plus two files beyond the plan's four: `__tests__/scratch-target.ts` (target guard) and `__tests__/scratch-target.test.ts` (its refusal tests). No Caterly, Better Auth, Prisma schema or migration file was changed; nothing calls the helper outside its tests |
| Contract | Contract as accepted: `timeoutMs` is one budget measured on the monotonic clock from the helper call (connection wait, lock wait, starting `fn`); `fn` is never invoked past the deadline; both options must be positive and at most 2147483647 ms (`RangeError` otherwise); a spent budget or a lock wait that times out rejects with `MemberLockTimeoutError`. New exports: `MemberLockTimeoutError`, `MAX_TIMEOUT_MS` |
| Test results | With `MEMBER_LOCK_TEST_DATABASE_URL` set to the approved scratch database: 107 tests passed, three consecutive runs (this was before the final `maxWaitMs` validation). 11 stub tests (no database) were added afterwards: `maxWaitMs`/`timeoutMs` range checks and the accepted-values case; the suite is now 118 tests. Non-database run with the variable unset: 100 passed, 18 skipped. The database suite was not rerun after the `maxWaitMs` validation. `tsc --noEmit` exit 0; ESLint clean on `src/lib/member-lock`; scratch tables left empty (0 rows in `user`, `organization`, `member`), no open transactions or advisory locks |
| Remaining limitations | (1) For budgets under about 10 ms the lock-timeout headroom is 0, so which error a caller sees when Prisma's timer and the lock timeout nearly coincide is not guaranteed; `fn` is still never called. (2) The lock-timeout (SQLSTATE `55P03`) recognition is verified only for Prisma 7.10.1 with `@prisma/adapter-pg` (`P2010`, `meta.driverAdapterError.cause.code`); other adapters or the classic engine are not converted and surface as the original error. (3) Pool exhaustion: every caller, including each waiter, holds one pooled connection for its whole transaction; no concurrency limit is imposed and pool configuration is unchanged. (4) The static guard scans `src/` only (not `apps/`, `packages/`, `scripts/`, `e2e/`) and cannot see Better Auth's own writes, nested relation writes or dynamic SQL; it is not repository-wide Member-write coverage. (5) The helper cannot stop `fn` using the root Prisma client; wrapping existing writes and enforcing that belongs to F8.2.4b. (6) A pool-wait timeout and a transaction-budget timeout are both Prisma `P2028` and differ only by message. (7) Node timers can fire up to about 1 ms early on some platforms, which the deadline documentation notes |
| Not done | F8.2.4b (wrapping existing Member writes, real Better Auth two-acceptances test). The scratch database `platterly_member_lock_test` is kept; dropping needs separate approval |
| History | The defects found and fixed during review (lock-wait timeout not bounded, callback deadline measured late, missing range checks, target-guard URL parameters) are described in the entries above and in the helper header comments; earlier decisions in this plan are unchanged |

### Acceptance note, 2026-11-04: F1.1.2 and F1.2.1 accepted by AJ (W0 entry conditions for F3.1.1)
| Item | Record |
|---|---|
| F1.1.2 verified | Isolated PostgreSQL 16.15 cluster (scratchpad, TCP 127.0.0.1:55432 only, nothing on 5432): `prisma migrate deploy` applied `20261101000000_baseline` from empty; `current_database()` `platterly_platform`, `current_user` `platterly_platform_app`; 0 tables apart from `_prisma_migrations`; `db.test.ts` 5 of 5; `npm run check:migrations` passed; `npx tsc --noEmit` exit 0 at the root and in `apps/platform` |
| F1.2.1 verified | 17 contract tests and 14 Platform import, routing and account tests passed with `DATABASE_URL=postgresql://nobody@127.0.0.1:1/none`; both TypeScript checks exit 0 |
| Limitations | The existing development database and its permissions are unverified; the isolated cluster did not test permission denial against real `platterly_dev` or `platterly_ops`; CI has not run; ESLint was not run; `apps/platform/` and the package changes are uncommitted; no separate build step for the package; only the specified tests were run, not the full root suite; provider reconciliation pending under F4.2.2 |
| Not accepted here | F1.1.1, F1.1.3 and Gate A. D1, D2, D5, E1, E2 stay open |
| Next | F3.1.1 is not started and not authorised. `platterly_platform_test`, its dedicated role and the sentinel are not created. F5.1.0 specification questions must be resolved before F3.2.1 |

### Acceptance note, 2026-11-04: F3.1.1 Stage 1 accepted by AJ (Stage 1 only; F3.1.1 is not finished)
| Item | Record |
|---|---|
| Scope delivered | One existing file modified, `apps/platform/prisma/schema.prisma` (models `User`, `UserIdentity`, `LegacyMapping`). Thirteen new files under `apps/platform/`: migration `20261104190000_identity_tables/migration.sql`; `prisma/rollbacks/20261104190000_identity_tables.down.sql`; `src/modules/users/{status.ts,email.ts,__tests__/users.test.ts}`; `src/lib/migration-roundtrip/{target.ts,down-sql.ts,history.ts,inventory.ts}` and `__tests__/{target,down-sql,history-inventory,identity-migration}.test.ts` |
| Design as accepted | `users.status` text NOT NULL default `active`, CHECK `active`/`disabled` (stored only). Email lower-case with CHECKs for non-empty, trimmed of exactly six ASCII characters written as `chr(32)`, `chr(9)`, `chr(10)`, `chr(11)`, `chr(12)`, `chr(13)` (no backslash escapes) and lower-case, plus a normal unique index. `normaliseEmail` trims JavaScript whitespace, lower-cases, returns null if empty or if whitespace remains inside; no format validation. `legacy_mappings.kind` CHECK `user`; `batch_id` NOT NULL only; `btrim(value) <> ''` on provider, subject, source_system, legacy_id. Foreign keys `ON DELETE RESTRICT ON UPDATE RESTRICT`. `timestamptz(3)`; `updated_at` default `CURRENT_TIMESTAMP` plus `@updatedAt`, no trigger. Organisation mappings deferred to F3.2.1. Rollback is three plain `DROP TABLE` statements, children first |
| Results | Isolated Vitest config with a poisoned `DATABASE_URL` and no `.env` read: 66 new tests, 14 existing Platform tests and 17 contract tests passed. `npx tsc --noEmit` exit 0 in `apps/platform` and at the root. ESLint on the new files exit 0. `npm run check:migrations` passed. `prisma validate` valid. `prisma migrate diff --from-empty --to-schema` output equals `migration.sql` except Prisma's `CREATE SCHEMA IF NOT EXISTS "public"` line and the nine hand-added CHECK constraints (tables, columns, types, defaults, five unique indexes and both foreign keys identical) |
| Manifest | Baseline and final captures in the Claude scratchpad `f311-manifest/`: 95 pre-existing files, only `schema.prisma` changed, 13 new files, branch/HEAD (`main`, `da926d4`), generated client and `.env` metadata identical. No commit |
| Limitations | (1) Migration and rollback SQL verified textually, not executed against PostgreSQL. (2) CHECK constraints, defaults, indexes and foreign keys unverified on a real server, including PostgreSQL's handling of the trim set, raw-SQL behaviour per ASCII character and JavaScript versus PostgreSQL lower-casing. (3) Up/down/up round trip pending Stage 2. (4) Prisma migration-history checksum (understood as SHA-256 of `migration.sql`) remains provisional. (5) Generated Prisma client not regenerated (stale against the schema). (6) `db.test.ts` not yet updated; its "starts empty" assertion fails once the migration is applied anywhere. (7) The Prisma CLI printed an update banner during `migrate diff` (run without `CHECKPOINT_DISABLE`), recorded as a possible incidental outbound network check; no confirmed data exposure; no traffic captured. ESLint had not previously run on this app |
| Not done | Database-connecting runner, `prisma.test.config.ts`, setup script and sentinel code, `.env.example` and `package.json` changes, regenerating the client. No database, role, sentinel or cluster was created or used |
| Stage 2 | **Not authorised.** Needs AJ's separate approval: isolated cluster, `platterly_platform_test`, role `platterly_platform_test_app` (design values only; the validator takes its allowed port as a required argument), sentinel, applying the migration, constraint tests, round trip, `db.test.ts` update, checksum and lower-case checks. Set `CHECKPOINT_DISABLE=1` and `PRISMA_HIDE_UPDATE_MESSAGE=1` on Prisma calls if AJ wants to rule out the update check. D1, D2, D5, E1, E2 stay open; F5.1.0 questions to be resolved before F3.2.1 |

### Acceptance note, 2026-11-04: F3.1.1 Stage 2 accepted by AJ (Stage 2 only; F3.1.1 as a whole is not marked complete)
| Item | Record |
|---|---|
| Target | New isolated cluster, PostgreSQL 16.15 (Homebrew, macOS, `C.UTF-8`), `127.0.0.1:55433` only; database `platterly_platform_test`, role `platterly_platform_test_app`; guard schema `runner_guard` (`sentinel`, `run_log`, `recovery_log`, `run_state`). Ports 5432 and 55432 were not contacted. Gate P: 69 of 69 probes |
| Run history | R1 attempt 1 `5a71b8b6-53c8-4202-b79d-025f972bb9e8` **failed** at `reset-rehearsal` (dependency check counted internal TOAST relations as external; nothing destructive ran), settled by one AJ-approved recovery record `acc1a863-cc81-4994-ba5d-98d2ea3bf16b` (19:22:40, `pgadmin`, no data change). Run 1 `dc62c9b0-3501-485d-b9a1-90ca4d73535c` finished (12 rows, 11 tests passed). Run 2 `647a63a9-5b2c-4d64-9224-ef960356366a` finished (9 rows, 8 of 8). Run 3 `54178604-dba0-4307-94fb-143ef71dcdcc` finished (5 rows, 6 passed, 3 skipped by design). Run 4 `a1e3689f-7487-4498-87cd-d9fd4d36172c` finished (7 rows, 6 of 6). Each `previous_run_id` points to the run before. `run_log` 38 rows, 5 `started`, `recovery_log` 1, `sentinel` 1, nothing unsettled |
| Migrations and tables | Two finished, none rolled back. Baseline `63c3a78793e1f4a491f446876c3c4dd82fc6318cd8dec698b0aeb0900a98bc74`; identity `01faffaa4186e37276ccf42a88ad1e58fe685567b5f42938483b5b5cc5cbfa81`; both equal the SHA-256 of the files (Stage 1 limitation 4 confirmed). `users`, `user_identities`, `legacy_mappings` empty; `migrate diff` reports no difference |
| Constraint findings | ASCII 0 to 127 matrix, Unicode corpus, defaults, status, uniqueness, blank checks, kind, `batch_id`, foreign keys (`23503` on delete and update) and column types checked in rolled-back transactions. Reported, not fixed: JavaScript and PostgreSQL lower-case U+0130, U+01C5 and U+01C8 differently; Unicode whitespace at the ends of an email is not refused (the database trims only the six ASCII characters) |
| Fingerprint | `expected-fingerprint.json`, 72 lines, `-r--------` with `uchg`, SHA-256 `ad2484bfebcc8e2dd5deea40062b1f456bdcbccc66770185aa7a0e3d1ec42789`, matches the setup record. Run 4 compared the live guard schema with it in memory and wrote nothing |
| Prisma Client | Regenerated with `prisma generate --config apps/platform/prisma.test.config.mjs` from the empty `~/.platterly/stage2/empty-cwd`, minimal environment, exit 0. 8 files before, 11 after: `models/{User,UserIdentity,LegacyMapping}.ts` added, 7 changed, `enums.ts` unchanged, none removed. Backup `~/.platterly/stage2/generated.backup-regen/prisma/`; manifests `regen-backup.sha256` (identical to the pre-copy source manifest) and `regen-after.sha256` |
| Closing checks | All exit 0: `tsc --noEmit` in `apps/platform` and at the root; ESLint on the new and changed files (the generated client is in the config's global ignores); `npm run check:migrations`; Stage 1 regression with a poisoned `DATABASE_URL` and no credentials: 66 new tests, 17 existing Platform tests, 69 contract tests. The three models are exposed by the regenerated client. Schema, migrations, rollback SQL and `email.ts` checksums unchanged |
| Files | Under `apps/platform/`, uncommitted: new `prisma.test.config.mjs`, `src/lib/migration-roundtrip/__tests__/{db-target.ts,db-target.test.ts,identity-roundtrip.db.test.ts,final-verification.db.test.ts}`, `src/modules/users/__tests__/users-constraints.db.test.ts`; modified `src/lib/__tests__/db.test.ts` (two modes), `.env.example` (empty `PLATFORM_TEST_CREDENTIALS_DIR`). Schema, migrations, rollback and `package.json` not changed |
| Evidence | `~/.platterly/stage2/` (mode 700): `evidence/` (`run2-constraints.out`, `run3-dbtest.out`, `run4-final.out`, `regen.out`, `close-*.out`), `manifests/`, `snapshots/` (A and B identical), `gatep-*.out`, `server.log`, `generated.before/`, `generated.backup-regen/`, `pgdata` |
| Limitations | (1) JavaScript versus PostgreSQL lower-casing differs for three characters. (2) Unicode whitespace gap in email validation. (3) Verified on macOS with `C.UTF-8`; the VPS locale is not verified. (4) The refusal branch for a genuine external TOAST dependency (`owned_toast = false`) was not tested against a real external dependency. (5) The Platform and contract test counts differ from the Stage 1 note (17 against 14, 69 against 17) and the difference is unexplained; `packages/contract` carries uncommitted changes (`index.ts`, `src/platform.ts`, the Platform-to-Ops product-list contract) that belong to the earlier Platform foundation work (AJ, 2026-11-04), not to another session; they are left out of the Platform foundation commit and go with the later Ops product-list integration. (6) Isolation of the existing development database (5432) from the Platform role is not verified |
| Not decided here | F3.1.1 as a whole is not marked complete and the section 11 boxes below stay unticked until AJ confirms F3.1.1's separate criteria. D1, D2, D5, E1, E2, the F5.1.0 questions, organisation legacy mapping (F3.2.1) and the push of local commits stay open. Nothing staged or committed |

## 11. W1 completion checklist (nothing ticked)
- [ ] The confirmations in section 9 recorded and the three plan deviations written into Revision 10
- [x] F8.2.3b report accepted (AJ, 2026-11-04; local scratch snapshot only, see `docs/member-duplicate-audit-results.md`). Other boxes stay unticked
- [x] F8.2.4a (accepted by AJ, 2026-11-04; limitations in the acceptance note above): helper tests pass on the scratch database; `git diff` shows no change to existing Caterly files; default `npm run test` still skips them
- [ ] Platform migrations apply cleanly to `platterly_platform_test` from scratch; up, down, up round trip passes; `check:migrations` passes
- [ ] Slot unique rule fails at the database for all four roles; disabled keeps the slot; removal frees it
- [ ] Owner-invariant tests pass, including concurrent demote, concurrent remove, five concurrent add-owner, a test that skips the lock, and transfer at full cap
- [ ] O1 idempotency tests pass (same key, different keys, changed hash, rollback)
- [ ] `linkProduct` and `unlinkProduct` tests pass, including injected failures
- [ ] Scratch database: `migrate diff` shows no difference, the three tables are empty, `member` has no pair-unique, and any failure was stopped and reported (no `pg_dump` fallback used)
- [ ] Owner-invariant tests B2 items 1 to 7 pass, including the isolation-level assertion, the SERIALIZABLE and REPEATABLE READ outcomes, the bypass cases and the deadlock outcome
- [ ] Last-link tests pass, including two simultaneous unlinks of the final two links and the raw-SQL bypass
- [ ] Dead-letter tests pass: a dead event keeps blocking; only `replayed`, `reconciled` or `waived` (audited, with evidence) releases it
- [ ] Tombstone and `getLinkState` tests pass; the known limitation (a zero-member product learns of an unlink only through reconciliation, which is not built in W1) is listed open
- [ ] Outbox: sequence allocation tests (commit, rollback, concurrency), head-of-line, backoff, dead-letter, two workers, with a fake sender; real delivery listed pending IC1
- [ ] Permission matrix and isolation suite green; fresh-auth enforcement listed pending D1/D2
- [ ] Audit completeness and redaction tests green
- [ ] `tsc`, `eslint` and the Platform Vitest suite clean; no Playwright run
- [ ] D5, D1/D2, E1, E2 still listed open; no S2 or `F8.3.2` reference; D15 described as Platform-only until the Caterly phase
