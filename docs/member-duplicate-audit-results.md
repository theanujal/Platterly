# Member duplicate audit: results (F8.2.3a)

Plan reference: `docs/platform-foundation-plan.md`, Part 3 section 13, step a (local audit, read-only). Approved by AJ on 2026-11-04. Script: `scripts/member-duplicate-audit.sql`.

## Result

**No duplicates. The unique index on `member("userId", "organizationId")` would apply to this data.**

| Item | Value |
|---|---|
| Database audited | `platterly_dev_audit_f823a`, a local copy of `platterly_dev` |
| Audit date and time | 2026-11-04 14:07:23 IST (08:37:23 UTC) |
| Member records checked | 43 |
| Distinct (user, organisation) pairs | 43 |
| Surplus rows | 0 |
| Duplicate combinations | 0 |
| Duplicate rows listed | none (0 rows) |
| Unique index already present on the pair | none, so the zero is a real finding and not the index hiding duplicates |

No personal information is recorded here: with no duplicates there is nothing to list.

## How the copy was made

`createdb platterly_dev_audit_f823a`, then `pg_dump --no-owner --no-privileges platterly_dev | psql -v ON_ERROR_STOP=1 platterly_dev_audit_f823a`. The dump only reads the original. `CREATE DATABASE ... TEMPLATE` was not used because it fails whenever any connection to the source is open, and the dev servers open and close connections at will (none were open when I checked afterwards). The copy was taken at about 14:07 IST on 2026-11-04.

| Table | Original | Copy |
|---|---|---|
| `member` | 43 | 43 |
| `organization` | 66 | 66 |
| `user` | 64 | 64 |

The original `platterly_dev` was only read (`\d member` and row counts). The audit ran on the copy inside `BEGIN READ ONLY ... ROLLBACK`. The copy is kept (29 MB); nothing was deleted.

## Does the query detect duplicates?

A control run over four made-up rows (one user in one organisation twice) returned 4 rows, 3 distinct pairs and 1 duplicate combination, so the detection logic works. It was a `SELECT` over inline values and wrote nothing.

## Limits of this result

- It covers the local dev database as of 14:07 IST on 2026-11-04. Nothing prevents a duplicate appearing later, because the unique index does not exist yet. That gap is why the plan requires the advisory-lock convention (`F8.2.4`) until the index is applied.
- Staging and production each need their own fresh audit (steps f and g). This result says nothing about them.
- Steps b to g are not started. With zero duplicates, steps b and c are recorded as "no duplicates", and step d (local resolution and migration test) still has to run.
- `member.locationId` references `kitchen`, which is empty in this database. The `locationId` column therefore carries no information yet, and the audit would still list it if a duplicate existed.

---

# Follow-up F8.2.3b: users with memberships in more than one organisation (prepared 2026-11-04)

The F8.2.3a result above is unchanged. This follow-up is added on 2026-11-04 and is **prepared only: the query has not been run**, so there are no findings yet.

Plan reference: `docs/w1-implementation-plan.md`, item F8.2.3b. Approved by AJ on 2026-11-04 for preparation only. Running it on a scratch copy needs AJ's separate approval.

## Status

| Item | Value |
|---|---|
| Query written | Yes, sections 4 to 7 appended to `scripts/member-duplicate-audit.sql` (sections 1 to 3 untouched) |
| Executed | **Yes, 2026-11-04 15:54 IST**, on the scratch copy only, with AJ's approval (see "Findings") |
| Acceptance | **Accepted by AJ, 2026-11-04**, with the limitations below |
| Verdict | **No user belongs to more than one organisation.** D15 would apply to this data without a recovery plan |

## Why this is asked

Decision D15 allows at most one membership per user per product, enforced by `UNIQUE (user_id, product_key)` on `membership_product_slots`. Caterly is one product. A user who belongs to two or more Caterly organisations would break that rule when Caterly data is imported. F8.2.3a covered the same user twice in the *same* organisation; this covers the same user in *different* organisations.

## Method

One read-only transaction (`BEGIN READ ONLY ... ROLLBACK`) with four `SELECT` statements over `member`, `user` and `organization`. Output is ids and counts only, no names or emails.

| Section | What it returns | Verdict use |
|---|---|---|
| 4 | Users total, member records, users with any membership, with none, with more than one organisation, with more than one *active* organisation, and the highest count for one user | `users_with_multiple_organisations` must be 0 for D15 to apply to this data without a recovery plan |
| 5 | Every membership row of each user in more than one organisation (ids, role, `disabledAt`, `locationId`, `createdAt`) | Zero rows means none. Otherwise it is the list to resolve |
| 6 | Distribution: number of users with 1, 2, 3 ... organisations | Counts only |
| 7 | Members with no matching user or organisation | Trust check on the totals; 0 expected because both foreign keys cascade |

"Organisations" are counted as `count(DISTINCT "organizationId")` per `userId`. The verdict uses all rows including disabled members, because under decision C8 a disabled member keeps the slot. The "active" column (`disabledAt IS NULL`) is context only.

## How to run (not yet approved)

On a scratch copy only, for example the existing `platterly_dev_audit_f823a`, or a fresh copy if AJ prefers one taken at the time of the run:

`psql "<copy database>" -v ON_ERROR_STOP=1 -f scripts/member-duplicate-audit.sql`

This runs sections 1 to 3 again as well. If AJ wants only the new sections, they can be run from a `psql` session by pasting sections 4 to 7. The existing copy is a snapshot from 14:07 IST on 2026-11-04 and may be stale; a fresh copy needs the approval for a copy to be made. The original `platterly_dev` must not be queried.

## Acceptance

**F8.2.3b accepted by AJ on 2026-11-04, with the limitations listed below.** 64 users, 43 membership records, 0 users in multiple organisations, 0 orphaned memberships, 21 users with no membership. Applies only to the 4 November 2026 14:07 IST scratch snapshot; staging and production were not checked.

Procedural notes as accepted: the first section 5 query failed on `DISTINCT` inside a window function and the corrected query was executed successfully in the complete rerun; the extra pre-check `SELECT` was read-only but outside the read-only transaction; no original development or production database was accessed. The findings below are unchanged by this acceptance.

## Findings (F8.2.3b run, separate from the F8.2.3a result above)

Run on 2026-11-04 at 15:54 IST (15:54:45 and 15:54:54, two runs, see "Run notes"). Sections 4 to 7 only; sections 1 to 3 were not rerun. AJ approved this run on 2026-11-04.

| Check before running | Result |
|---|---|
| `current_database()` | `platterly_dev_audit_f823a` |
| `transaction_read_only` inside the transaction | `on` |
| Snapshot is the expected one | Yes: member 43, organization 66, user 64, identical to the F8.2.3a copy counts. The copy was taken at about 14:07 IST on 2026-11-04. The database stores no snapshot timestamp, so identity is confirmed by name and counts only |

| Section 4 item | Value |
|---|---|
| Users total | 64 |
| Member records | 43 |
| Users with any membership | 43 |
| Users with no membership | 21 |
| **Users with more than one organisation** | **0** |
| Users with more than one active organisation | 0 |
| Most organisations for one user | 1 |

| Section | Result |
|---|---|
| 5. Memberships of multi-organisation users | 0 rows |
| 6. Distribution | 43 users with 1 organisation; no user with 2 or more |
| 7. Orphans | 0 members without a user, 0 without an organisation. **No orphaned memberships** |

**Against the earlier figures:** the plan's "64 users, 0 with more than one membership" is **confirmed** (64 users, 0 with more than one organisation). It also agrees with F8.2.3a (43 member records, 43 distinct user and organisation pairs, 0 duplicates). The 21 users with no membership at all is new information, not an anomaly in the verdict.

No ids are listed because no row qualified. No personal information was returned.

## Run notes

- The first run stopped at section 5 with a Postgres error: `DISTINCT` is not allowed in a window function. That was a defect in my query, not in the data. The transaction ended with nothing changed. I rewrote section 5 in `scripts/member-duplicate-audit.sql` as a join to a grouped subquery (same output columns) and reran sections 4 to 7 in full; the results above are from that rerun. Section 4 gave identical numbers in both runs.
- Before the first run, a one-line `SELECT current_database(), current_setting('transaction_read_only')` was executed outside the transaction, so it printed `off`. It was a plain `SELECT` and wrote nothing. The sections themselves ran inside `BEGIN READ ONLY ... ROLLBACK`, and the pre-check in a read-only transaction showed `on`.
- Only `platterly_dev_audit_f823a` was connected to. `platterly_dev` was not touched.

## Limitations

- The result describes the 14:07 IST snapshot, not the live dev database, which may have changed since.
- A user is identified by `member."userId"`. Two different `user` rows for the same real person (different email addresses) are **not** detected. Matching by email would need personal data and is out of scope for this audit.
- It covers only current `member` rows. Pending `invitation` rows (which carry an email, not a user id) could create a second membership later and are not examined.
- It describes one database at one point in time. Staging and production need their own fresh audits (F8.2.3f and g). Nothing prevents a user being added to a second organisation after the run, which is why the lock convention (`F8.2.4`) and, later, the slot rule exist.
- Local dev data may contain test accounts, so a zero or non-zero here is not evidence about real customers.
- Memberships in Ops (`apps/ops`) and the Platform app are separate databases and are not covered.
