# Single-Business-Admin Invariant: Design Proposal (C16 prerequisite 2)

**Status: proposal for AJ's review. The design as a whole is not yet approved.** Prepared 2026-11-06 and revised the same day to incorporate AJ's explicit policy decisions P1 to P6 and four review corrections (A to D). It designs a database invariant on paper. It does **not** complete C16 prerequisite 2 (that needs AJ's explicit approval of a design), does **not** authorise `F3.2.1`, and creates no schema, migration, code, database or service. SQL below is **illustrative**, not a migration specification. Prerequisites 3, 4 and 5 stay outstanding.

| Item | Statement |
|---|---|
| Authority used | Foundation Plan **Revision 11** (approved 2026-11-06 for prerequisite 1), the decision register, Revision 6 sections 4 and 10, the accepted 263-row test list, the W1 plan section 8B (as the historical pattern), `apps/platform/prisma/schema.prisma` (today only `users`, `user_identities`, `legacy_mappings`; no organisation tables exist) |
| Evidence tags | **A-H**, **A-R**, **A-R+O** (relayed, not treated as fully approved), **Derived**, **Historical**, **Open**, **Proposed** (design written here; not an approval), **AJ-P** (AJ's decisions P1 to P6 of 2026-11-06, section 7.1) |
| What AJ has decided | Policy questions P1 to P6 only (section 7.1). The technical choices T1 to T6 (section 7.2) are **recommendations awaiting AJ's approval** |
| Out of scope | Section 9 |

## 1. Executive summary

**The rule to enforce.** Every business has exactly one Admin [A-R, Admin rule 1]; there are no co-Admins [A-R, Admin rule 3]; a normal transfer replaces the Admin in one transaction with no holding state for the authority [A-H, A2; A-R, Admin rule 6]; recovery appoints one new Admin [A-R, Admin rule 7]; the previous Admin's record and historical Admin role are retained, disabled by default [A-R, C3].

**AJ's decisions applied (section 7.1).** A business **may exist without an Admin** before its first successful Admin appointment (P1: yes). Once an Admin has been established the business must **never have zero active Admins**, so replacement and recovery must be atomic (P2: never). The central role value is `admin` and no other central value is introduced (P3). A former Admin is **disabled** by default; removal is reserved for explicitly approved exceptions (P4). The former Admin's product slot (P5) and reappointment of a former Admin (P6) are **deferred and left open**.

**Recommended design (all Proposed):**
1. **Representation.** One row per person-business relationship in `organisation_members` with `central_role` limited to `'admin'` and `status` of `active | disabled | removed`. "Active Admin" means `central_role = 'admin' AND status = 'active'`. A former Admin keeps the row as `disabled` (C3 point 2).
2. **At most one, in the database.** A partial unique index over active Admin rows per organisation.
3. **Never zero after establishment, in the database, on every path.** An `admin_established` flag that **cannot be set by a caller**: organisations are always inserted unestablished, the flag moves to true only when the first active Admin row appears (or a trigger-validated update finds one), never returns to false, and a deferred check runs from **both** the member table and the organisation table, so neither a direct organisation insert nor a direct organisation update can bypass the floor (section 4.3 and 6.1).
4. **One replacement primitive** (`replaceAdmin`) for the **central Admin rows only**. It takes the organisation lock, checks an expected previous Admin, demotes the old row first and promotes the new row second, in one transaction. It does **not** create, remove, transfer or modify product memberships and does **not** allocate or release product slots (section 6.2 and 6.6).
5. **Isolation.** Default `READ COMMITTED`. Correctness does not depend on the lock: the index and the triggers are the backstop.

**Still open (not decided here, section 7.2):** Decision M, BC-07, C7, ordinary-claim Admin conferral (CLM-20), the route by which a sole Admin may leave (ADM-08; the route must be a replacement, but its content is not decided), TR-06, TR-21, P5 (slot, EXC-14/SLT-12), P6, SLT-10, REC-30, REF-10.

## 2. Testable invariant

### 2.1 Definitions (Proposed, carrying approved concepts)

| Term | Definition | Basis |
|---|---|---|
| Business | One row in `organisations`; scope of uniqueness is `organisation_id` (the `biz_` id). Not per product | A-R (Admin rule 1); plan section 3 |
| Central membership record | A row in `organisation_members`: a person's relationship to a business. Grants no product permissions | A-R (C5 point 4) |
| Central role | The single central authority role, Business Admin, stored as `'admin'`. No central Manager or Member; no other central value is introduced by this design | A-R (C5 points 1, 2); AJ-P (P3) |
| Status | `active`, `disabled`, `removed` (working labels carried from the plan and W1; **not approved schema**) | Proposed; Revision 6 section 4.2 |
| **Active Admin** | A row with `central_role = 'admin'` **and** `status = 'active'` | Proposed |
| **Historical Admin record** | A row with `central_role = 'admin'` and `status` `disabled` (default) or `removed` (approved exceptions only). It holds **no** central authority | A-R (C3 points 1, 2, 6); AJ-P (P4) |
| **Unclaimed business** | An organisation with `admin_established = false` and no active Admin. A valid state | AJ-P (P1) |
| **Established business** | An organisation whose `admin_established = true`. The flag becomes true only when an active Admin row exists, and never reverts | Proposed; AJ-P (P2) |

### 2.2 The invariant (what a test asserts)

| # | Statement | Layer |
|---|---|---|
| I-1 | **At most one.** In every committed state, an organisation has 0 or 1 active Admin | **Database** (partial unique index) |
| I-2 | **Never zero after establishment** (AJ-P, P2). In every committed state, an organisation with `admin_established = true` has exactly 1 active Admin | **Database** (deferred constraint triggers on **both** `organisation_members` and `organisations`) |
| I-3 | **Establishment cannot be forged or undone.** An organisation row can never be inserted with `admin_established = true`; the flag can move false to true only when an active Admin row exists; it can never move true to false | **Database** (immediate triggers on `organisations`) |
| I-4 | **History survives.** A row with `central_role='admin'` is never hard-deleted, never moved to another organisation, and never re-pointed to another person (`user_id` is immutable on it); leaving or replacement only changes `status` (and, for a person's own row, promotes it) | **Database** (triggers) and service |
| I-5 | **One transaction, one organisation.** A transaction that changes the Admin changes only that organisation | Application (W1 `lockOrganisation` rule), guard test |
| I-6 | **Authority passes only through the primitive.** No service function other than `replaceAdmin` writes an active `central_role='admin'` row | Application (static guard test, as in the F3.1.2 pattern) |
| I-7 | **Central replacement has no product side effects.** `replaceAdmin` does not change product memberships or product slots | Application (design rule and test) |

I-1, I-2, I-3 and I-4 hold even if the application lock is skipped and even for a direct SQL writer that is not a superuser or a trigger-disabling role.

### 2.3 Active authority versus retained history

The disabled former Admin keeps a row and holds the `UNIQUE (organisation_id, user_id)` position, but is invisible to I-1 and I-2 because `status <> 'active'`. The row grants nothing [A-R, C3 point 2; C5 point 4]. Whether that retained row also keeps a **product slot** (W1 C8: "a disabled member keeps the slot") is **P5, deferred**, together with EXC-14 and SLT-12, to C16 prerequisite 3. This design neither keeps nor frees any slot.

## 3. Lifecycle state analysis

| State | What the approved record says | Active Admins | Design treatment | Open item |
|---|---|---|---|---|
| **S1 New business (O1)** | Creator becomes initial Admin; slot taken and product linked in the same transaction; refused if the creator already holds a slot for the product [A-R, Admin rule 2; A-H, D13, D15, W1 C7] | 1 from the first commit | `createOrganisation` inserts the organisation (unestablished), then the creator's active Admin row (the establishment trigger sets the flag), within one transaction, together with the slot and link steps that O1 already requires. The slot and link steps belong to O1 under W1 C7 and D13, **not** to `replaceAdmin` (section 6.6) | Product effect of being Admin: BC-07 (not decided) |
| **S2 Unclaimed** (provisioned or imported, awaiting its first Admin) | **P1: YES. A business may exist without an Admin before its first successful Admin claim** [AJ-P]. Previously open as ADM-09 | 0 | Valid state: `admin_established = false`, only I-1 applies, nothing forces an Admin | Which routes may confer Admin is S3 |
| **S3 First Admin appointed** | Recovery claim, once consumed, appoints the one new Admin [A-R, Admin rule 7]. Whether an **ordinary** O2 claim makes the claimant the Admin is **not decided** [Open, Decision M, CLM-20]. O4 is blocked on E2 [A-H] | 0 to 1 | `replaceAdmin` with `expectedPrevious = none`: refused if any active Admin exists; on success the flag becomes true and the business is established from then on. The primitive is neutral about which claim types call it | Decision M, CLM-20, C7, E2 (not resolved here) |
| **S4 Normal transfer (O3)** | Atomic replacement on acceptance; **no holding state for the authority** [A-H, A2]; former Admin loses central Admin authority and may stay as an employee or leave [A-R+O, C2]; nominee must be entirely new to Platterly [A-R, C4] | 1 before and after | `replaceAdmin(expectedPrevious = the initiator's member row)`; old row to `disabled`, new row `active`, in one transaction. No observable moment with zero or two active Admins | TR-06, TR-21, initiating role (Decision M) |
| **S5 Recovery** | One new Admin appointed when the recovery claim is consumed [A-R, Admin rule 7]; previous Admin's membership disabled by default; removal only for confirmed compromise or abandonment [A-R, C3; A-R+O, B2]. That the disablement happens **at consumption** is **Derived** (CLM-22, REC-17) | 1 before and after | Same primitive. Revokes a pending offer by the replaced Admin (C13), by the same transaction or by the expected-previous check (section 6.4) | E-29, REC-35, and the whole recovery procedure (REC-30 and others) stay open; this design only provides the replacement step |
| **S6 Established business whose only Admin would be disabled, removed or leave without a replacement** | Not described by any approval before P2. **P2: NEVER zero** [AJ-P]. Previously ADM-10 / E-17 ("how a disabled sole Admin counts") | would be 0 | **Impossible to commit.** Any change that would leave an established business with no active Admin is refused (I-2). The only way the Admin changes is `replaceAdmin`, which demotes and promotes in one transaction | The *route* by which a sole Admin may leave is still ADM-08 (open); P2 fixes only that it cannot leave a gap |
| **S7 Former Admin afterwards** | May return as an **employee** only via the current Admin's normal employee invitation, through the product workflow [A-R, C3 pts 3, 4]. May not be a normal-transfer nominee, because they already have an account [A-R, C4 point 4] | n/a | The row stays `disabled`/`'admin'`. The database refuses a second active Admin whatever route tries to re-enable it (I-1). **Whether a former Admin may be reappointed through this design is not decided** (P6, deferred) | P6 |

No transition is invented. S3 (ordinary claim conferral) and S7 (reappointment) are shown as open.

## 4. Database enforcement alternatives

Every alternative is judged against: (a) prevents two active Admins; (b) atomic replacement; (c) safe under concurrent claims and transfers; (d) no invalid committed state, including through direct writes to **either** table; (e) retains history; (f) does not smuggle in policy.

### 4.1 T1: how to represent "who is the Admin"

| Option | Mechanism | Strengths | Weaknesses |
|---|---|---|---|
| **M1 Role and status on the member row** (recommended) | `central_role='admin'` + `status`; partial unique index over active Admin rows | Closest to the W1 baseline and the plan's `organisation_members`; history is a non-active row; no extra table | Replacement is two row writes (order matters); "who is Admin" needs a query |
| M2 Pointer on the organisation | `organisations.admin_member_id` → member; row CHECK (`NOT admin_established OR admin_member_id IS NOT NULL`) | Uniqueness is structural; replacement is one `UPDATE`; the floor on that table is a plain CHECK | The pointer must also reference an **active** member of the **same** organisation (needs a composite FK trick or triggers on two tables); history needs a separate marker; circular FK at creation |
| M3 Tenure table | `organisation_admin_terms` with `UNIQUE (organisation_id) WHERE ended_at IS NULL` | Cleanest history, no role vocabulary | Extra table; overlaps the unapproved audit design (prerequisite 4); P3 fixes the vocabulary as `admin`, which M3 makes moot |

**Recommendation: M1.**

### 4.2 T2: how the database rejects a second active Admin

| Option | Verdict |
|---|---|
| **Partial unique index** (recommended): `UNIQUE (organisation_id) WHERE central_role='admin' AND status='active'`. Immediate; violation is SQLSTATE 23505 | Declarative, independent of the lock and of any trigger. Requires the order *demote old, then promote new* |
| Deferrable exclusion constraint | Allows promote-before-demote. Less common, harder to review. Not needed if the order is fixed |
| Deferred count trigger (W1 8B style, cap 1) | Works but reproduces the multi-owner machinery the single-Admin model removed. Keep triggers only for the floor |
| Application check only | **Rejected.** Write skew and no protection from paths that skip the service |

### 4.3 T3: never zero after establishment, on every path (Correction A)

**The gap in the earlier draft.** A flag plus a deferred trigger on `organisation_members` alone could be bypassed by a direct `INSERT INTO organisations (…, admin_established) VALUES (…, true)` with no member rows, because no member row change fires the member-table trigger. Likewise a direct `UPDATE organisations SET admin_established = true` on an Admin-less organisation, or a later `UPDATE … SET admin_established = false`, escapes the member trigger.

**Corrected design (Proposed): five triggers that close every path.**

| Trigger | Table and timing | Rule | Closes |
|---|---|---|---|
| **TR-A** no forged insert | `organisations`, BEFORE INSERT, immediate | Reject any insert with `admin_established = true`. Organisations are created unestablished (unclaimed). Only the establishment trigger (TR-C) can set the flag, after an active Admin row exists | Direct INSERT of an established organisation without an Admin; direct INSERT of an established organisation at all |
| **TR-B** guarded flag | `organisations`, BEFORE UPDATE, immediate | (1) Reject true to false. (2) Allow false to true only if an active Admin row for this organisation exists at that moment | Direct UPDATE that clears the flag; direct UPDATE that sets it on an Admin-less organisation |
| **TR-C** establishment | `organisation_members`, AFTER INSERT OR UPDATE, immediate | When a row is, or becomes, an active Admin, set `organisations.admin_established = true` (a no-op if already true). The service never sets the flag | The only legitimate route to "established" |
| **TR-D** floor from the member side | `organisation_members`, AFTER INSERT OR UPDATE OR DELETE, **DEFERRABLE INITIALLY DEFERRED**, per row | First `SELECT … FROM organisations WHERE id = … FOR UPDATE` (the lock that prevents write skew, as in W1 8B). If the organisation row is gone, return. If `admin_established`, require exactly one active Admin | Any member insert, update or delete that would leave an established business with no Admin (including a status change, and any attempt to delete or move an Admin row) |
| **TR-E** floor from the organisation side | `organisations`, AFTER INSERT OR UPDATE, **DEFERRABLE INITIALLY DEFERRED**, with `WHEN (NEW.admin_established)` | Take the same row lock, then require exactly one active Admin | Any direct organisation write that leaves an established organisation without an Admin, including a transaction that touches the organisation row and the members in the same commit |

Together with TR-A to TR-C, TR-E makes "established and zero Admins" unreachable by writing either table directly. The member-side trigger TR-D covers the case where only member rows change. A member-row `organisation_id` change is refused (I-4), so an Admin cannot be moved to another organisation to bypass TR-D. `DELETE` of an Admin row is refused outright (I-4), which also removes the sole-Admin deletion path.

**Why deferred, and why the intermediate state is safe.** `replaceAdmin` demotes the old row and promotes the new row in one transaction. Between the two statements the transaction sees zero active Admins, but no other transaction can see it (`READ COMMITTED` shows only committed data), and TR-D and TR-E fire at commit, when exactly one exists again. If the transaction fails or rolls back, nothing is committed and the previous valid arrangement is intact (SA-10). The partial unique index is immediate, so it still forbids two active Admins even inside the transaction, which is why the order demote-then-promote is required.

**Establishment of the first Admin.** An unclaimed organisation (flag false, no active Admin) has no floor. When `replaceAdmin(expectedPrevious = none)` inserts or promotes the first active Admin row, TR-C sets the flag to true in the same statement's trigger chain, and from the commit onward TR-D and TR-E guard the business. The flag is therefore a consequence of a real Admin row, not an input.

**Replacement and recovery preserve exactly one.** Every later change goes through `replaceAdmin`: lock, compare-and-swap on the expected previous Admin, demote, promote, commit. The index guarantees at most one at every statement, and TR-D and TR-E guarantee at least one at every commit.

**Residual bypasses, stated plainly.** A superuser or table owner disabling triggers (`ALTER TABLE … DISABLE TRIGGER`, `session_replication_role = replica`), `TRUNCATE`, and wholesale backup restore are outside the guarantee, as in the W1 plan section 8B. The partial unique index is not bypassed by trigger disabling, which is why it is the primary guarantee for I-1. Keeping the application database role free of `TRIGGER` and `TRUNCATE` privileges is a requirement to confirm at implementation time.

**The design does not rely only on application checks:** I-1 to I-4 are database guarantees. The application layer adds the expected-previous comparison, the single-organisation rule and the writer guard.

### 4.4 T4: serialisation of concurrent changes

| Option | Verdict |
|---|---|
| **Organisation row lock via the W1 `lockOrganisation(tx, id)` helper** (recommended), one organisation per transaction | The approved convention [A-H, W1]. Serialises claim consumption, transfer acceptance and recovery for one business. Index and triggers remain the backstop for any path that skips it |
| Advisory lock keyed on the organisation | Equivalent, adds a second mechanism |
| `SERIALIZABLE` isolation | Every caller would need retries. Not required |

Isolation stays at the default `READ COMMITTED` and must not be lowered (W1 8B). Under stricter isolation the same cases raise a serialisation error, which is also safe.

### 4.5 T5: where the replacement lives

| Option | Verdict |
|---|---|
| **Service function `replaceAdmin(tx, …)` plus the database constraints as backstop** (recommended) | Matches the repository pattern; testable with a static guard (I-6) |
| A PostgreSQL function called by the service | Moves business logic into SQL; revisit only if a non-service writer appears |

### 4.6 T6: retaining history

| Option | Verdict |
|---|---|
| **Keep the row; change `status`; block DELETE and organisation moves on Admin rows** (recommended) | Satisfies C3 point 2 and the W1 rule that removed rows keep history. `UNIQUE (organisation_id, user_id)` means one row per person per business |
| Tenure table | See M3 |
| Audit log only | **Rejected as the sole record.** The audit table design is not approved (prerequisite 4), and C3 asks the *membership record* to be retained |

The audit write for each replacement uses the existing W1-B transaction-safe writer in the same transaction. The audit row contents are prerequisite 4 and are not designed here.

## 5. D15 mapping

The D15 rule (plan section 3b, approved 2026-11-04 [A-H], consolidated by AJ on 2026-11-05 as "one membership per user per product, managed independently by each product" [A-R]) is that an identity holds at most one membership per product, in any role, enforced in the database. The **three open questions** that section 3b records are quoted from "Questions for the `F5.1.0` spec (not yet decided)": **(1)** "whether a freed slot has any cooling-off period (proposed: none)" (SLT-10); **(2)** "how staff recover an owner who locked themselves out by choosing the wrong email (proposed: the dispute procedure, section 12)" (REC-30); **(3)** "what message the invitee sees when refused" (REF-10). The plan states "None of them changes the rule." **All three remain open after this proposal.**

| D15 element | Relationship to the Admin invariant | Effect of this design |
|---|---|---|
| Slot table `membership_product_slots`, `UNIQUE (user_id, product_key)` | **Independent.** The Admin invariant counts central Admin rows only. Whether the slot table exists in the plan's shape is open (SLT-12; employees need no central membership, C6) | Implementable whichever way SLT-12 is decided. `replaceAdmin` neither reads nor writes slot rows (section 6.6) |
| O1: creator takes the slot and becomes Admin in one transaction | Same transaction as S1, composed by `createOrganisation` under W1 C7 and D13 | Both fail or both commit. This is O1's approved behaviour, not part of `replaceAdmin` |
| O3: nominee must hold no slot, and under C4 no account at all | C4 is stricter than the slot check; their relation is open (TR-23) | The route-level service validates the nominee before calling the primitive. `replaceAdmin` enforces only the Admin invariant |
| Disabled member keeps the slot; only removal frees it [A-H, W1 C8] | A disabled former Admin's slot outcome is **P5, deferred** to C16 prerequisite 3 and EXC-14/SLT-12 | **Not resolved here.** P4 fixes the status as `disabled`; what that means for the slot is not decided |
| **Question 1: cooling-off** (SLT-10) | A2 concerns the ownership-transfer process (authority passes at acceptance, no holding state for the authority). SLT-10 concerns whether a *freed product slot* has a cooling-off period. These are **separate matters** | **SLT-10 stays open.** This proposal defines no delay, no holding period and no immediate-reuse rule for freed product slots, and does not infer any from A2 or from atomic transfer |
| **Question 2: wrong-email lock-out** (REC-30) | Technical capability only: `replaceAdmin` identifies the previous Admin by their **member record**, not by a live session, so an authorised route can call it without the previous Admin signing in | This is a property of the replacement step. It **does not define or approve** a wrong-email recovery process. **REC-30 stays open.** No recovery evidence, verification step, staff permission, dispute handling or procedure is specified here |
| **Question 3: refusal message** (REF-10) | A database refusal arises as a named unique-index violation (23505) or a trigger exception. These must be mapped to the approved generic refusal behaviour (R-C1 to R-C3) and never expose another organisation's identifiers | The design supplies **distinct, stable constraint and trigger names** so the application can map them. The message text is REF-10 / R-C4 and is not designed here |
| One membership per user, in any role, at the database | The Admin row is a membership; whether slots exist for every member is SLT-12 | No conflict; no decision |

## 6. Recommended design

All of this is **Proposed**. Names are illustrative.

### 6.1 Columns, constraints and triggers (illustrative)

```sql
-- organisations (excerpt)
--   admin_established boolean NOT NULL DEFAULT false      -- never set by a caller; see TR-A..TR-C

-- organisation_members (excerpt)
--   central_role text NOT NULL CHECK (central_role IN ('admin'))   -- AJ-P P3: no other value
--   status       text NOT NULL CHECK (status IN ('active','disabled','removed'))
--   UNIQUE (organisation_id, user_id)
--   organisation_id is immutable (BEFORE UPDATE trigger refuses a change)
--   user_id is immutable on central Admin rows (BEFORE UPDATE trigger: raise if OLD.central_role = 'admin'
--     AND NEW.user_id IS DISTINCT FROM OLD.user_id)    -- see the rule below

-- I-1: at most one active Admin per organisation (immediate)
CREATE UNIQUE INDEX organisation_members_one_active_admin_key
  ON organisation_members (organisation_id)
  WHERE central_role = 'admin' AND status = 'active';

-- TR-A  BEFORE INSERT ON organisations:      raise if NEW.admin_established
-- TR-B  BEFORE UPDATE ON organisations:      raise if OLD.admin_established AND NOT NEW.admin_established;
--                                            raise if NOT OLD.admin_established AND NEW.admin_established
--                                                     AND NOT EXISTS (active Admin row for NEW.id)
-- TR-C  AFTER INSERT OR UPDATE ON organisation_members (immediate):
--         when NEW is an active Admin: UPDATE organisations SET admin_established = true
--                                      WHERE id = NEW.organisation_id AND NOT admin_established
-- TR-D  CONSTRAINT TRIGGER AFTER INSERT OR UPDATE OR DELETE ON organisation_members
--         DEFERRABLE INITIALLY DEFERRED, FOR EACH ROW:
--         SELECT ... FROM organisations WHERE id = <org> FOR UPDATE; return if row gone;
--         if admin_established and (count of active Admin rows) <> 1 then raise
-- TR-E  CONSTRAINT TRIGGER AFTER INSERT OR UPDATE ON organisations
--         DEFERRABLE INITIALLY DEFERRED, FOR EACH ROW WHEN (NEW.admin_established):
--         same lock and the same exactly-one check
-- I-4   BEFORE DELETE ON organisation_members: raise if OLD.central_role = 'admin'
```

**Rule: `user_id` is immutable on central Admin membership rows.** Once a row has `central_role = 'admin'`, its `user_id` can never be changed, whether the row is active, `disabled` or `removed`. Without this rule a direct `UPDATE` of `user_id` on the sole active Admin row would pass every check above (the count of active Admins stays one) while silently swapping the person in place, bypassing `replaceAdmin`'s expected-previous comparison and destroying the retained historical record of the former Admin (C3 point 2). **`replaceAdmin` must therefore replace the Admin using the existing membership records, never by changing the `user_id` of an Admin row:** the previous Admin's row stays attached to the previous person and is set to `disabled`, and the new Admin is represented by their own row, inserted for the new person or, if that person already has a row in this organisation, promoted (its `central_role`/`status` change, its `user_id` does not). This keeps one row per person per business (`UNIQUE (organisation_id, user_id)`) and keeps every former Admin's history attached to the right person. This rule adds no policy: it concerns row identity only, and leaves P5, P6 and every other deferred question unchanged.

Prisma cannot express partial unique indexes, CHECK constraints or triggers; as with the existing identity tables, these live in migration SQL only. That migration, and the choice of constraint and trigger names, is for a later approved implementation task.

### 6.2 The replacement primitive

`replaceAdmin(tx, organisationId, expectedPreviousMemberId | none, newUserId, reason)`. The previous Admin's row always becomes `disabled` (AJ-P, P4). Removal is **not** an option of this primitive; if an approved exception later needs it (B2: confirmed compromise or abandonment; invocation open at E-29 and REC-35), that is a separate, explicitly named path that this proposal does not design.

| Step | Action | Why |
|---|---|---|
| 1 | `lockOrganisation(tx, organisationId)` | Serialise with every other claim, transfer or recovery for the business; one organisation per transaction (W1) |
| 2 | Read the current active Admin. If it is not `expectedPreviousMemberId` (including "expected none, found one", and "expected one, found none"), fail with a stable refusal and write nothing | Compare-and-swap. A transfer started by Admin A cannot complete after a recovery replaced A (C13); two first-appointment claims cannot both succeed |
| 3 | If an expected previous Admin exists, set that row to `disabled` | Must come **before** step 4 so the partial unique index is satisfied |
| 4 | Promote or insert the new Admin's row as `central_role='admin'`, `status='active'` (an existing row for that person is promoted, never duplicated). **Never change the `user_id` of an existing Admin row** | One row per person per business; history stays attached to the right person (section 6.1 rule) |
| 5 | Same-transaction audit write and outbox event through the W1-B writers | Atomic with the authority change [A-H, A2]. Audit contents are prerequisite 4 |
| 6 | Commit. TR-D and TR-E then check the committed shape | Intermediate states exist only inside the transaction and are invisible to other transactions |

`expectedPrevious = none` is the **first-appointment** form (S1, S3): it is refused if any active Admin exists, and its success makes the business established (TR-C).

### 6.3 Status transitions on an Admin row

| From to | Allowed | Enforced by |
|---|---|---|
| (none) to `active` | Only through `replaceAdmin` | Application guard (I-6); index (I-1) |
| `active` to `disabled` | Only as the demotion step inside `replaceAdmin`, in the same transaction as a promotion (or while the business is unestablished, which cannot occur since an active row establishes it). A standalone disablement of the sole Admin is refused at commit | TR-D, TR-E (I-2) |
| `active` to `removed` | Not part of this design. Reserved for explicitly approved exceptions (P4, B2) whose invocation is open (E-29, REC-35); the floor applies to them as to any other change | TR-D, TR-E |
| `disabled` or `removed` to `active` | The database refuses it while another active Admin exists, whatever route attempts it. Whether any route may reappoint a former Admin is **P6, deferred** and not decided | Index (I-1) |
| DELETE | Never | I-4 trigger |

### 6.4 Concurrency and the transfer/recovery interaction

| Race | Outcome |
|---|---|
| Two first-appointment claims at once | One wins at the lock; the other fails the expected-previous check. With the lock skipped, the index rejects the second commit |
| Transfer acceptance racing recovery | Whichever takes the lock first wins. If recovery wins, the acceptance finds a different active Admin and fails; if acceptance wins, recovery's expected-previous no longer matches and must be re-evaluated |
| Offer by Admin A pending while recovery replaces A | The offer is revoked [A-R, C13]. The expected-previous check is a second defence even if revocation is delayed |
| Two concurrent demotions of the sole Admin | At most one effective change; no commit leaves zero Admins. The in-trigger row lock serialises them |
| Skipped `lockOrganisation` | Duplicates still impossible (index). Zero-Admin commits still impossible (TR-D, TR-E) |

### 6.5 Role vocabulary (and what is **not** decided)

| Term | Meaning here | Stored in the Admin invariant? |
|---|---|---|
| **Central Business Admin** | The single central authority role [A-R, C5; X5: "Use the central role terminology Admin, not Owner"] | Yes: `central_role = 'admin'` (AJ-P, P3). No other central value is introduced by this design |
| **Historical Owner terminology** | The word in quotations of the plan, W1, Gate B-1, and the original wording of X2, X3, Y2.1 and Y2.3 [Revision 6 section 3] | **No.** No `'owner'` value exists in the central table |
| **Product-level roles** | Caterly's `owner/manager/staff/...`, overrides and sensitive keys, managed inside the product; Caterly may keep its own `owner` term [A-R+O] | No. The central table never stores or implies a product role |
| **Product-managed employees** | Managed entirely in products; need no central membership; product invitations create none [A-R, C6] | No. They have no row here, so they can never be counted as an Admin or block the index |

This design **does not decide Decision M** (whether the central Owner of earlier documents, Y2.3's "Owner-level authority" and the Business Admin coincide) **or BC-07** (how central Admin authority is recognised in a product). The invariant counts one central row; it says nothing about what that person may do in a product, who may initiate a transfer (ADM-06) or which Owner-only actions apply to the Admin (ADM-11). Whether an ordinary O2 claim confers Admin (CLM-20) remains open; this design introduces no second central role value to accommodate either answer.

### 6.6 Boundary: central Admin replacement versus product membership and slots (Correction D)

`replaceAdmin` changes **only** the central Admin rows of `organisation_members` (and writes its audit and outbox records). It does **not**:

- create, remove, transfer or modify any product membership or product employee record;
- allocate, release, transfer or re-point any product slot, and it does not read the slot table;
- grant or remove any product permission, or touch Caterly, Rivo, Ops or any other product;
- apply any cooling-off, holding or reuse rule to a slot (SLT-10 is open).

Product membership and slot outcomes remain subject to the relevant product rules, D13 and D15 as already approved, and C16 prerequisite 3. EXC-14 (the retained disabled former Admin's record against the slot rule) and SLT-12 (the role of the slot table under per-product management) remain **open**. Where a route (O1, O3, recovery) needs a slot or product-membership step, that step is performed by the route's own service according to prerequisite 3; the route may run in the same transaction as `replaceAdmin`, but the composition is the route's, not the primitive's. No cross-system side effect is added to `replaceAdmin`.

## 7. Decisions

### 7.1 AJ's decisions on C16 prerequisite 2 (2026-11-06), applied exactly

| ID | Question | AJ's decision | Where applied |
|---|---|---|---|
| **P1** | Unclaimed businesses | **YES.** A business may exist without an Admin before its first successful Admin claim | 2.1, 3 (S2), SA-03, SA-04 |
| **P2** | Never-zero Admin | **NEVER.** Once an Admin has been established, the business must never have zero active Admins; replacement or recovery must be atomic | 2.2 (I-2, I-3), 3 (S6), 4.3, 6.1 to 6.3, SA-06 to SA-19 |
| **P3** | Central role vocabulary | **`admin`.** No additional central role values introduced by this design | 2.1, 6.1, 6.5 |
| **P4** | Former Admin status | **DISABLED** by default. Removal reserved for explicitly approved exceptions | 2.1, 6.2, 6.3, SA-20, SA-21 |
| **P5** | Former Admin's product slot | **DEFERRED.** Left open for C16 prerequisite 3 and EXC-14/SLT-12 | 2.3, 5, 6.6 |
| **P6** | Reappointing a former Admin | **DEFERRED.** Left open; this design does not decide it | 3 (S7), 6.3 |

### 7.2 Still open (not decided by this proposal)

| ID | Item | Where it must be settled |
|---|---|---|
| P5 | Whether the retained disabled former Admin keeps a product slot (EXC-14, SLT-12) | C16 prerequisite 3 |
| P6 | Whether a former Admin may be reappointed (by a normal transfer the answer is already no for the account-holder, C4; recovery is silent) | AJ, later |
| SLT-10 | Cooling-off for a freed product slot | D15 / prerequisite 3 |
| REC-30 | Wrong-email lock-out recovery | Recovery procedure decisions |
| REF-10 | The message shown to a refused invitee | Implementation-time refusal wording (R-C4) |
| ADM-08 | The route by which a sole Admin may leave. P2 fixes only that it must not leave a gap, so the route is necessarily a replacement | AJ, later |
| E-29 / REC-35 | How the B2 removal exception is invoked | AJ, later |
| Decision M, BC-07, CLM-20, C7, TR-06, TR-21, TR-23, ADM-04 to ADM-07, ADM-11, ADM-12, SLT-12, MEM-05 | Unchanged; none is touched here | As recorded |
| Audit table (prerequisite 4), D5, O-F421 | Unchanged | As recorded |

### 7.3 Technical choices (Proposed; awaiting AJ's approval of the design)

| ID | Choice | Recommendation |
|---|---|---|
| T1 | Representation | M1: role and status on the member row |
| T2 | Duplicate prevention | Partial unique index |
| T3 | Never-zero on every path | Flag guarded by TR-A and TR-B, set only by TR-C, checked by deferred TR-D and TR-E |
| T4 | Serialisation | Organisation row lock plus constraints as backstop; stay `READ COMMITTED` |
| T5 | Where the swap lives | Service function with constraints as backstop; central rows only |
| T6 | History | Keep the row, block DELETE and organisation moves, no tenure table |

## 8. Test matrix

"DB" means a guarantee the database enforces, and the test must prove it **with the application lock bypassed**. "APP" means an application-level check or a service guard. Concurrency tests use separate real connections with a barrier, as the W1 plan requires. **No test below has been written or run.** Rows marked *Open* cannot be finalised until the named decision exists.

| ID | Scenario | Setup | Action | Expected | Layer | Depends on |
|---|---|---|---|---|---|---|
| SA-01 | Concurrent creation of two active Admins | Unestablished organisation | Two connections insert an active Admin row at once, lock skipped | Exactly one commits; the other fails with the unique-index violation | DB | none |
| SA-02 | Duplicate attempt on an existing Admin | Active Admin A | Insert or promote a second active Admin | Fails; A unchanged | DB | none |
| SA-03 | **Unclaimed business can exist with no Admin** | none | Insert an organisation with `admin_established = false` and no members; commit | Commits; 0 active Admins; no constraint complains | DB | P1 |
| SA-04 | **First successful Admin appointment establishes the Admin** | Unclaimed business | `replaceAdmin(expectedPrevious = none, userX)` | Exactly one active Admin X; `admin_established` is true after commit, set by TR-C and not by the caller | DB + APP | P1; which routes may call it is CLM-20 / Decision M (*Open*) |
| SA-05 | First appointment when an Admin exists | Active Admin A | `replaceAdmin(expectedPrevious = none)` | Refused; A unchanged | APP + DB backstop | none |
| SA-06 | **Established business cannot be left with zero Admins** | Established, sole active Admin A | `UPDATE` A to `disabled` with no replacement, then commit | Commit refused (TR-D); A remains active | DB | P2 |
| SA-07 | Removing the sole Admin | As SA-06 | `UPDATE` A to `removed`, or `DELETE` the row | Both refused (TR-D / I-4) | DB | P2, P4 |
| SA-08 | Concurrent demotions with the lock skipped | Established, one Admin | Two transactions each demote the Admin | No commit leaves zero active Admins | DB | P2 |
| SA-09 | **Replacement is atomic: no observable zero or two** | Active Admin A | Run `replaceAdmin` to B while a second connection reads repeatedly | The second connection sees A until the commit and B afterwards; never zero, never two | DB + APP | P2 |
| SA-10 | **Failed replacement leaves the previous Admin intact** | Active Admin A | Force a failure after demoting A (and again after promoting B, before commit; and with a violated expected-previous) | Transaction aborts; A is the only active Admin, no new row, no partial write, audit and outbox rows absent | DB (transaction) + APP | P2 |
| SA-11 | Concurrent replacement | Active Admin A; two calls naming B and C | Run both | Exactly one succeeds; the other fails the expected-previous check; one active Admin remains | APP + DB backstop | none |
| SA-12 | Replacement with the lock skipped | As SA-11 | Bypass the helper | Index still prevents two active Admins; floor still prevents zero | DB | none |
| SA-13 | Wrong order inside the transaction | Active Admin A | Promote the new row before demoting A | Fails at the index, proving the order is required | DB | none |
| SA-14 | **Direct INSERT of an established organisation** | none | `INSERT` an organisation with `admin_established = true`, with or without member rows | Refused (TR-A) | DB | P2 |
| SA-15 | **Direct UPDATE setting the flag on an Admin-less organisation** | Unclaimed business | `UPDATE … SET admin_established = true` | Refused (TR-B) | DB | P2 |
| SA-16 | **Direct UPDATE clearing the flag** | Established business | `UPDATE … SET admin_established = false` | Refused (TR-B) | DB | P2 |
| SA-17 | **Direct organisation modification cannot hide a zero-Admin commit** | Established, sole Admin A | In one transaction, disable A and update another column of the organisation row | Commit refused (TR-D and TR-E) | DB | P2 |
| SA-18 | Admin row cannot be moved to another organisation | Active Admin A in organisation X | `UPDATE` A's `organisation_id` | Refused (immutable) | DB | none |
| SA-19 | Hard delete of an Admin row | Any Admin row, active or disabled | `DELETE` | Refused | DB | none |
| SA-20 | **Former Admin is disabled by default** | Replacement completed | Read the old row | Row exists, `central_role='admin'`, `status='disabled'`, no active authority; the primitive offers no removal option | DB + APP | P4 |
| SA-21 | Removal exception | Former Admin | Apply the B2 removal exception | *Open*: invocation is E-29 / REC-35; no test is defined until AJ decides | n/a | P4, E-29 |
| SA-22 | A second active Admin is refused whatever the route | After SA-20 | Set the old row back to `active` while another Admin is active | Refused by the index. This asserts only the database fact; whether a former Admin may ever be reappointed is **P6, deferred** | DB | none |
| SA-23 | **Central replacement does not implicitly modify product membership or slots** | Business with product memberships and slot rows (whatever shape prerequisite 3 decides) | Call `replaceAdmin` on its own | Product membership rows, slot rows and product permissions are byte-for-byte unchanged by the primitive | APP | SLT-12, prerequisite 3 (*cannot be run until those tables exist*) |
| SA-24 | Primitive contains no product or slot access | Source tree | Static guard | `replaceAdmin` imports and calls nothing from the product-membership or slot modules | APP (guard) | none |
| SA-25 | Transfer acceptance racing recovery | Pending offer by A; recovery for the same business | Accept and consume at once | One wins; the loser fails the expected-previous check; exactly one active Admin | APP + DB | none |
| SA-26 | Offer outlives its initiator | A started an offer; recovery replaced A | Nominee tries to accept | Refused (C13); no change | APP | none |
| SA-27 | Replacement without the previous Admin's session | Active Admin A, no live session | Authorised route calls `replaceAdmin` naming A's member row | Works; this checks the technical capability only | APP | **REC-30 stays open**: no recovery procedure is tested |
| SA-28 | Employee has no central row | Product employee exists | Count central rows and Admins | No row; the employee cannot be an Admin or block the index | APP | C6 |
| SA-29 | Central record grants no product permission | Disabled former Admin | Try product actions | Refused (MEM-01) | APP | BC-07 for the Admin's own access, not for this row |
| SA-30 | One transaction, one organisation | Any | Change two organisations in one transaction | Refused by the helper | APP | W1 |
| SA-31 | Only the primitive writes an active `'admin'` row | Source tree | Static guard | No other writer found | APP (guard) | none |
| SA-32 | Constraint and trigger names are mappable | Any refusal | Inspect the error | Stable names; no other-organisation identifier leaks | DB + APP | REF-10 text open |
| SA-33 | Normal transfer atomicity | Active Admin A; accepted offer to B | Accept | In one commit A is disabled and B is active | DB + APP | TR-06 (*Open*) |
| SA-34 | **`user_id` of an Admin row cannot be changed** | Established, sole active Admin A (person P1); another person P2 exists | Directly `UPDATE` the Admin row's `user_id` from P1 to P2, with the lock skipped, then commit (and repeat on a `disabled` former-Admin row) | Refused by the `user_id` immutability trigger. The row still belongs to P1, the active-Admin count and the history are unchanged, and `replaceAdmin` with its expected-previous check remains the only way the Admin changes | DB | I-4; C3 point 2 |

**Database-enforced guarantees:** I-1, I-2, I-3, I-4 (SA-01, SA-02, SA-03, SA-06 to SA-10, SA-12 to SA-19, SA-22, SA-34). **Application-level checks:** the expected-previous comparison, the single-organisation rule (I-5), the writer guard (I-6), the no-product-side-effect rule (I-7), claim, offer and nominee validation, lock interactions, refusal mapping.

## 9. Explicit non-goals and assumptions

**Non-goals.** This document does not: approve or write any schema, migration, trigger or code; authorise `F3.2.1`; mark C16 prerequisite 2 complete; resolve Decision M, BC-07, C7, TR-06, TR-21, TR-23, EXC-14, SLT-10, SLT-12, REC-30, REF-10, ADM-04 to ADM-08, ADM-11, ADM-12, MEM-05, P5 or P6; design the audit table, case record or staff permission model (prerequisite 4, `F4.2.1`); define the claim table or any pending-claim limit; design the slot table or any slot rule; specify any recovery or dispute procedure; design any UI; or touch Caterly, Rivo, Ops or the decision register.

**Assumptions** (each can be checked at approval time).
1. The Platform database is PostgreSQL and supports partial unique indexes, CHECK constraints, deferrable constraint triggers (with a `WHEN` condition) and `FOR UPDATE` row locks. (The existing identity migration already relies on CHECK constraints.)
2. The W1 conventions stand: one transaction changes one organisation, default `READ COMMITTED`, `organisation_id` immutable, `user_id` foreign key `RESTRICT`.
3. The application database role has no `TRIGGER` or `TRUNCATE` privilege and does not use `session_replication_role`. Superusers, table owners and wholesale backup restore are outside the guarantee, as in W1 section 8B.
4. Employees hold no central row (C6). If a later decision gives non-Admin people a central row (MEM-05, SLT-12), the design still counts only active `central_role = 'admin'` rows, and this proposal adds no role value for them.
5. `replaceAdmin` receives an already-validated nominee. How a person "entirely new to Platterly" reaches acceptance, and whether their account is created inside the acceptance transaction, is TR-06.
6. Prisma cannot express these constraints, so they live in migration SQL; `npm run check:migrations` applies only to migrations that could remove or rewrite data, and a new-table migration is expand-only.
7. Organisation deletion by staff (manual) and any import or backup procedure are outside this invariant.

**What approval of this design would and would not do.** If AJ approves it, C16 prerequisite 2 can be recorded as satisfied for the approved parts. Prerequisites 3 (membership and product-slot rules, C7), 4 (schema and audit-table decisions) and 5 (implementation and migration approvals) remain outstanding, and `F3.2.1` stays unauthorised until all five are met.
