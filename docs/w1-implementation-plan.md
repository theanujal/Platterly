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

### F8.2.4a `withMemberLock`, helper, tests, baseline guard
Files, all new: `src/lib/member-lock/with-member-lock.ts`, `src/lib/member-lock/known-member-writes.json`, `src/lib/member-lock/__tests__/with-member-lock.test.ts`, `src/lib/member-lock/__tests__/member-write-guard.test.ts`. No existing file changes. See clarification A for isolation.

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
| Pre-flight schema verification (before any test is written against it) | (1) Run `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code`; any difference means the migrations do not produce the schema Prisma expects. (2) Assert in a setup script that `user`, `organization` and `member` have the columns and constraints the helper tests rely on, that `member` has **no** unique constraint on `(userId, organizationId)`, and that the foreign keys from `member` to `user` and `organization` exist. (3) Assert those three tables hold 0 rows and record row counts of every other table. **If any check fails, stop and report the exact difference. Do not continue** |
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

## 11. W1 completion checklist (nothing ticked)
- [ ] The confirmations in section 9 recorded and the three plan deviations written into Revision 10
- [ ] F8.2.3b report accepted
- [ ] F8.2.4a: helper tests pass on the scratch database; `git diff` shows no change to existing Caterly files; default `npm run test` still skips them
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
