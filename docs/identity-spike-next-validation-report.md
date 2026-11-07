# Identity spike: next validation report, scratch only (2026-11-02)

Follows `docs/identity-spike-results.md`, `docs/identity-spike-remediation-checklist.md`, `docs/identity-spike-remediation-results.md` and `docs/identity-spike-followup-report.md`, all unchanged. Everything except Task 5 ran in scratch projects, scratch databases or the scratch copy of Caterly (Better Auth 1.7.15). The repository still resolves `better-auth` 1.7.4. Nothing was committed or pushed. No scratch database or project was deleted. No provider was chosen, F2.1.4 and Logto were not touched, and nothing in Platform or Ops authentication changed. The only change outside scratch is the separately approved Caterly forwarded-host fix (Task 5).

Scratch folder: `/private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/cb904566-5b08-45a0-9688-17538e210dc7/scratchpad/`. New scratch files are in `idp-spike/`, with new names (`op4.mjs`, `op5.mjs`, `rp5.mjs`, `rp6.mjs`, `dispatcher6.mjs`, `setup-pm2.sql`, `setup-gen.sql`, `restore-procedure.mjs`, `r9a`..`r9e`), so the files behind the earlier reports are unchanged. Result files: `r9a-results.json` .. `r9e-results.json`.

## Summary

| # | Task | Result | Still open |
|---|---|---|---|
| 3 | Mechanism suite 7 of 8 | **Resolved.** PM2 was not a defect in the mechanism: it records that a superuser can bypass the guard. Part of that bypass is now closed (replica role), the rest is detected (DDL audit and health monitor). 4 of 4 new checks pass; the durable suite still passes 23 of 23. | A superuser can still disable the guard. Detection, not prevention. |
| 2 | Per-session mapping | **PASS** 8 of 8 (two devices, two products, two businesses). The old durable suite passes 23 of 23 against the new product (one test needed a realistic event). | Real browsers and the fail-closed missing-sid login path are NOT TESTED. |
| 1 | Generation and restore | **PASS** 10 of 11 in the real backup/restore run; the 11th (HZ1) failed because of a flaw in my check and passes 2 of 2 when re-run separately (see the HZ1 note). Both hazards (HZ1, HZ2) are reproduced. | Registry durability is a design item; real-time schedule and hosted databases NOT TESTED. |
| 4 | Caterly compatibility | **PASS** 27 of 27 across 9 spec files on 1.7.15. | Org switcher and ownership transfer do not exist in Caterly (NOT TESTED). |
| 5 | Forwarded-host fix | **PASS** (local). Forged-header test fails before and passes after. | Two other host-routing tests fail in the main repo, on the original code too. |

## Task 3. The remaining mechanism-suite failure (PM2)

**Root cause.** The failing row is PM2 in `r8a-mechanism.mjs` (line 53). PM2 does not test that the mechanism works. It tries to bypass the guard as a superuser (`ALTER TABLE ... DISABLE TRIGGER`, and `session_replication_role = replica`) and sets its status to FAIL when the bypass works (`d1 > 0 && d2 > 0 ? "FAIL" : "PASS"`). The FAIL was the bypass succeeding. The earlier report called it "FAIL by design", which was an accurate but unhelpful label. There was no malfunction in the revocation mechanism, and 7 of the 8 other checks are about it.

**What the investigation found.**
1. The replica-role route is closable. The guards were plain `ENABLE` triggers, which do not fire under `session_replication_role = replica`. Setting them to `ENABLE ALWAYS` makes them fire there too.
2. The `DISABLE TRIGGER` and `DROP TRIGGER` routes cannot be prevented from a superuser or the table owner, but they can be detected: an event trigger records every DDL command on the table into an append-only audit, and `guard_health()` returns a row for each guard that is missing or not `ENABLE ALWAYS`.
3. The replica-role bypass has a second cost. It skips foreign-key actions, so deleting sessions that way left 4 `oauthAccessToken` and 4 `oauthRefreshToken` rows pointing at sessions that no longer existed. This was invisible until `pg_restore` of a backup failed on the foreign key (Task 1). I repaired the scratch data by setting those references to NULL, which is what the cascade would have done.
4. The old PM2 test itself re-enables with a plain `ENABLE TRIGGER`, which silently downgrades the guard from `ENABLE ALWAYS`. After my rerun of r8a the monitor reported "guard trigger not ENABLE ALWAYS: guard_session_data_delete (state O)" and the DDL audit showed the commands. I put it back to `ENABLE ALWAYS`. Procedure rule: guards are only ever re-enabled with `ENABLE ALWAYS`, and `guard_health()` is run after any maintenance.

**Code paths.** `setup-pm2.sql` (ENABLE ALWAYS, `guard_ddl_audit`, event triggers `guard_ddl_watch` and `guard_drop_watch`, `guard_health()`); `r9a-pm2.mjs`; original check at `r8a-mechanism.mjs:53`, left unchanged.

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| PM2a | session_replication_role=replica no longer bypasses the guards (triggers are ENABLE ALWAYS): delete and truncate are both refused | **PASS** | delete: 42501 session_data rows are deleted only by session_delete_instead() (current_user=aj); truncate: 42501 session_data may not be truncated; sessions left 2 |
| PM2b | A superuser CAN still disable a guard (cannot be prevented), but it is recorded in an append-only DDL audit and the health monitor reports it while it is off | **PASS** | healthy before: true; while disabled: ["guard trigger not ENABLE ALWAYS: guard_session_data_delete (state D)"]; DDL audit rows +1; rows removed with no event: 2 (events 0); after re-enable: []; audit tail: [{"command_tag":"ALTER TABLE","object_identity":"public.session_data","actor":"aj"},{"command_tag":"ALTER TABLE","object_identity":"public.session_data","actor":"aj"}] |
| PM2c | Dropping a guard trigger is recorded and flagged; recreating it clears the alert | **PASS** | flagged: ["guard trigger missing: guard_session_data_delete"]; DDL audit rows +1 (DROP); after recreate: [] |
| PM2d | With the guards restored a direct delete is refused again | **PASS** | 42501 session_data rows are deleted only by session_delete_instead() (current_user=aj) |

**Reruns after the change.** `r8a-mechanism.mjs` unchanged: PM1, BA1, BA2, EA1 to EA4 PASS; PM2 FAIL, because it still asserts that the bypass works and, as found in item 4, downgrades the guard first. I did not edit it, so the 7 of 8 result is reproducible, and PM2a to PM2d are the replacement checks. `r8b-durable.mjs`: 23 of 23 PASS.

**Remaining limitations.** A superuser or the table owner can still disable or drop a guard and delete session rows without events. Detection depends on someone looking at `guard_health()` and the DDL audit; it must be wired to monitoring. The audit table is writable by a superuser too. `session_replication_role` is not audited (nothing to see in DDL); `ENABLE ALWAYS` makes it ineffective against the guards.

## Task 2. Per-session mapping

**Design.** The OP session id is already the `sid` claim in the ID token and the `sessionId` in every `session.revoked` event; I checked that all three are the same value. The scratch product (`rp5.mjs`) records the `sid` at login in `session_op_sid(session_id, sid)` (cascade-deleted with the session), from a Better Auth after-hook on the callback that reads the ID token Better Auth just stored. If the ID token has no `sid` the session is deleted and the login fails (fail closed; NOT TESTED, see below).
- A `session.revoked` event ends only the product sessions mapped to that `sid`, and only for the event's own user. An event with no `sessionId` is ignored, not widened.
- A back-channel logout token with a `sid` ends that session only; without a `sid` it means all of the subject's sessions (OIDC).
- Membership removal ends the sessions working in that business (unchanged).
- The recovery pull (`op4.mjs`) now asks the platform which OP sessions are alive (`/api/platform/users/<sub>/active-sessions`, signed with the product's secret) and ends every product session whose `sid` is not among them, plus sessions with no recorded `sid`.

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| SM1 | At login each product session stores the OP session id (sid): two devices at two products give four product sessions mapped to exactly two OP sids, each equal to the real OP session id | **PASS** | OP sessions e4FpIJWvQCQYZRjW9fcKcMv7UYdA89us, OH611auUIbSJ6vkSSCPrJDy4Py2iuRqJ; app1 sids ["e4FpIJWvQCQYZRjW9fcKcMv7UYdA89us","OH611auUIbSJ6vkSSCPrJDy4Py2iuRqJ"]; app2 sids ["e4FpIJWvQCQYZRjW9fcKcMv7UYdA89us","OH611auUIbSJ6vkSSCPrJDy4Py2iuRqJ"] |
| SM2 | Single-session logout at the OP (device A), delivered by platform events only: device A ends in BOTH products; device B stays signed in at both; device B's OP session is untouched | **PASS** | before A1:alive B1:alive A2:alive B2:alive; after A1:ended B1:alive A2:ended B2:alive; OP session A alive: false; OP session B alive: true |
| SM3 | Single-session logout at the OP, back-channel logout only (events held back): the logout token's sid ends only device A's sessions in both products; device B survives | **PASS** | before A1:alive B1:alive A2:alive B2:alive; after A1:ended B1:alive A2:ended B2:alive; back-channel deletions counted per product [1,1] |
| SM4 | User-wide revocation through the service (logout everywhere): every session of that user ends at the OP and in both products; another user's sessions are untouched | **PASS** | revoked 2; after A1:ended B1:ended A2:ended B2:ended; OP alive for revoked user: false; other user A1:alive B1:alive A2:alive B2:alive |
| SM5 | Removing the person from business A ends only the product sessions working in business A (device A, both products); the sessions working in business B and both OP sessions stay | **PASS** | after A1:ended B1:alive A2:ended B2:alive; OP A alive true; OP B alive true |
| SM6 | Both back-channel and event lost: the recovery pull asks the platform which OP sessions are alive and ends only the product sessions whose sid is gone; device B is untouched | **PASS** | risk window (before reconcile) A1:alive B1:alive A2:alive B2:alive; reconcile app1 {"platformEpoch":1,"applied":0,"revoked":1}; app2 {"platformEpoch":1,"applied":0,"revoked":1}; after A1:ended B1:alive A2:ended B2:alive |
| SM7 | A product session with no stored sid is not targeted by a single-session event (it survives, a stated limitation) but the recovery pull ends it (fail closed) | **PASS** | unmapped session after its OP session ended and the event was delivered: still alive; after recovery pull: ended; reconcile {"platformEpoch":2,"applied":1,"revoked":2} |
| SM8 | A correctly signed event for user X that names user Y's sid ends nothing of Y's (the delete is scoped to the event's own user) | **PASS** | HTTP 200: {"applied":true,"revoked":0}; victim's session still alive: true |

**Regression.** `r8b-durable.mjs` against the new product: 22 of 23. The one failure (ID2) was a hand-made event with no `sessionId`, which the new product ignores by design. A copy of the suite (`r9c-durable-sid.mjs`) with `sessionId` in that event, as real events always have: **23 of 23 PASS**. The original file is unchanged.

**Remaining limitations.**
- "Two browsers" are two cookie jars sent over HTTP. No real browser took part. NOT TESTED in Playwright.
- The fail-closed login without a `sid` is implemented but NOT TESTED (it needs an OP that omits the claim).
- A product session with no recorded `sid` is not touched by a single-session event; only the recovery pull ends it (SM7). Any existing Caterly session would be in this state at the moment mapping is introduced, so there needs to be a migration plan (the safe default is to end them at cut-over).
- Two simultaneous logins by the same user could pair a session with the other login's ID token (the hook reads the account's current ID token). Not tested; the production design should carry the `sid` through the OAuth state or use the token response directly.
- The per-user revocation epoch is still per user, not per session; reconciliation uses the live-session list instead.

## Task 1. Platform generation and a real backup/restore

**Design (proposed, built in scratch).** Every event carries `generation` next to the existing `scope` and `sequence` (conceptually generation + businessId + sequence).
- **Source of truth outside the restored database.** A registry file (`control/platform-generation.json`) outside every database and every backup. A copy exists in `platform_generation` inside the database for the events themselves. At boot the platform refuses to start if the database generation is behind the registry (`checkGeneration()` in `op5.mjs`). In production this registry has to be something a database restore cannot touch: a file or secret on the host that is backed up separately, plus an off-host copy. Which one is a decision for you.
- **Restore procedure (`restore-procedure.mjs`).** (1) restores into a NEW database and refuses to overwrite an existing one; (2) new generation = max(registry, restored database) + 1; (3) writes the registry first (atomic write, fsync, rename); (4) then the database; (5) ends every OP session through the service, so every end produces an event in the new generation. Writing the registry first means a crash between 3 and 4 leaves the registry ahead of the database, so the platform refuses to start rather than run with a rolled-back generation.
- **Products (`rp6.mjs`).** Watermarks are keyed by generation. A lower generation is refused. A higher one: discard the old watermarks, run the per-session reconcile for every user against the platform, record the change in `gen_history`, and then apply the event. If any reconcile fails the whole event is rolled back and retried later. The recovery pull also refuses a platform whose generation is lower than the product has already seen.
- **Why sessions are ended on restore.** A restored database brings back sessions that were revoked after the backup. HZ1 shows a signed session cookie from before working again against a naively restored platform. Ending all OP sessions is the conservative answer; the cost is that every user signs in again once (in the scratch run, 56 sessions of 43 users). That is a design choice that needs your confirmation.

**Test flow (`r9d-restore.mjs`, `r9e-hz1.mjs`).** A user with two devices at two products is signed in; a real `pg_dump` backup is taken; device A signs out and device C signs in after the backup; the disaster is a restore of that backup into a new database, first naively (control), then with the procedure.

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| GN0 | Baseline at generation 1: events carry the generation; the product keys its watermark by generation (1:user:<id>); device A ended, B and the post-backup device C are signed in | **PASS** | registry 1; product generation {"generation":1}; watermark 1:user:<id> = 1 (sequence at backup was 0); A1:ended B1:alive C1:alive A2:ended B2:alive |
| HZ1 | Control, hazard 1: after a naive restore the platform starts without any warning, and device A's OP session, revoked after the backup, is alive again | **FAIL** | naive restore started: true (generation check {"checked":true,"ext":1,"inDb":1} / OP3 on :4510, issuer http://auth.localhost:4510); OP session A alive again: false (this proves the hazard; the control reproduced as predicted) |
| HZ2 | Control, hazard 2: after a naive restore the next event reuses an already-seen sequence number, the product ignores it as stale, and device B stays signed in at both products after it signed out at the OP | **PASS** | A1:ended B1:alive C1:alive A2:ended B2:alive; product stale-sequence count 1; (hazard reproduced: B is signed out at the OP but not in the products) |
| GN1 | The restore procedure restores into a new database, advances the external registry to 2 BEFORE the database, writes the database generation, and ends every OP session through the service | **PASS** | registry 1 -> 2; restored database generation 2; step: restored /private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/cb904566-5b08-45a0-9688-17538e210dc7/scratchpad/control/backup-gen1.dump into spike_dur_gmvz3fho7 ; step: database generation 1, registry generation 1, new generation 2 ; step: registry set to 2 ; step: database generation set to 2 ; step: ended 56 OP session(s) of 43 user(s... |
| GN2 | Boot guard: a database restored without the procedure (generation 1) refuses to start once the registry is at 2 | **PASS** | exit code 3; } / REFUSING TO START: database generation 1 is behind the external registry 2. This database was restored without the restore procedure. |
| GN3 | On the first event of the new generation each product records generation 2, discards the generation-1 watermarks, rebuilds from the platform and ends the sessions the restored platform does not know (A, B and the post-backup C) | **PASS** | OP up: true; app1 {"generation":2} history [{"from_gen":1,"to_gen":2,"detail":{"users":187,"failed":0,"revoked":91}}]; app2 {"generation":2}; watermarks app1 [{"scope_key":"2:user:0YaD4jZ53tTYC4eGdhQlUUMaTcYLeNZW","last":"1"},{"scope_key":"2:user:2gXMIOS9xf5HOmiZfR3OiiIYhWTpzgha","last":"2"},{"scope_key":"2:user:2KDLCs5cZMBwvmnaTcjUn1QUEALM8aAf","last":"2"}]; A1:ended B1:ended C1:ended A2:ended B2:ended |
| GN4 | After the controlled restore a new sign-in and sign-out works end to end: the event (generation 2, a low sequence number) is applied, the same situation that was ignored in HZ2 | **PASS** | signed in before sign-out: true; after: ended; watermarks now [{"scope_key":"2:user:j90jtZVyvmXindGPf3BvxPCIoMEkDkp0","last":"3"}] |
| GN5 | A correctly signed event from the old generation (1) is refused as an old generation and changes nothing | **PASS** | HTTP 200 {"applied":false,"reason":"old generation","known":2}; session still signed in: true |
| GN6 | Product-side defence: if the platform ever reports a generation lower than the product already saw (a rollback that bypassed the procedure), the recovery pull refuses to act on it | **PASS** | reconcile answered {"error":"platform generation 2 is behind 9","revoked":0} (the scratch product's remembered generation was set to 9 for this check only and put back to 2) |
| GN7 | Restoring the same OLD generation-1 backup a second time cannot roll the generation back: the new generation is registry+1 (3), and the procedure refuses to overwrite an existing database | **PASS** | registry now 3; step: database generation 1, registry generation 2, new generation 3 ; step: registry set to 3; second run into the same name: refused, exit 4: REFUSED: database spike_dur_hmvz3fho7 already exists; the procedure never overwrites |
| GN8 | Products follow a second generation change (2 to 3) the same way | **PASS** | app1 {"generation":3}; history [[1,2],[2,3]] |

**HZ1 note.** The first HZ1 check (in the table above) FAILED because of a flaw in my test: sign-out clears the cookie from device A's cookie jar, so "A's session is alive" could not be asked that way. `r9e-hz1.mjs` re-checks it properly by restoring the same backup into a fresh database and presenting the correctly signed old session cookie, as below. Both results are kept.

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| HZ1a | Control: sessions that were revoked after the backup exist again in a naively restored database | **PASS** | unexpired sessions in the backup: 56; of those revoked since in the live platform: 1 (control: this is the hazard being present) |
| HZ1 | Control, hazard 1: after a naive restore a session that was revoked after the backup works again (the signed session cookie from before is accepted) | **PASS** | HTTP 200; get-session user j90jtZVyvmXindGPf3BvxPCIoMEkDkp0, expected j90jtZVyvmXindGPf3BvxPCIoMEkDkp0 (control: PASS means the hazard is real) |

**Other findings during this task.** `pg_restore` failed the first time because of the dangling references described in Task 3 (item 3). A restored database is therefore also an integrity check of the guard story.

**Remaining limitations.**
- Single scratch PostgreSQL; no hosted database, pooling, replica or point-in-time recovery was tested.
- The registry here is a file. Its durability, backup and access control are production decisions. If the registry itself is lost, the safe rule is: new generation = highest generation any product reports, plus one. Not built, NOT TESTED.
- Business-level membership state is not reconciled on a generation change (only sessions are). Membership events exist but a membership snapshot endpoint was not modelled. NOT TESTED.
- The procedure does not run `guard_health()` at the end; it should (recommended, not built).
- The reason `staff_action` was used for the post-restore revocation; a real `platform_restore` reason needs adding to the allowed list.
- Scratch databases created in this task and kept: `spike_dur_nmvz3ew9c` (partial restore from the failed first attempt), `spike_dur_nmvz3fho7` (naive), `spike_dur_gmvz3fho7` (generation 2), `spike_dur_hmvz3fho7` (generation 3), `spike_dur_hz1_mvz3gk61`.

## Task 4. Caterly compatibility on the scratch copy (Better Auth 1.7.15)

Scratch dev server on port 3010, own database `spike_caterly`, one spec file at a time with one worker.

| Area | Spec file | Result |
|---|---|---|
| Login, logout, sign-up, active organisation set on sign-in | `kitchenlogin.spec.ts` | **PASS** 5 of 5 |
| Logged-out access | `logged-out-access.spec.ts` | **PASS** 4 of 4 |
| Navigation and logout | `navigation.spec.ts` | **PASS** 3 of 3 |
| Invitations, team add/remove, role changes | `team-management.spec.ts` | **PASS** 1 of 1 |
| Permission enforcement | `role-permissions.spec.ts` | **PASS** 5 of 5 |
| Sensitive access by role | `roles-sensitive-access.spec.ts` | **PASS** 3 of 3 |
| Role-specific order view | `kitchen-role-order-view.spec.ts` | **PASS** 2 of 2 |
| Password reset and account recovery | `password-reset.spec.ts` | **PASS** 2 of 2 |
| Session expiry and server-side session end (new, scratch only) | `session-expiry-scratch.spec.ts` | **PASS** 2 of 2 |

Total: 27 of 27.

- **Session expiry spec.** There was no existing journey for it, so I wrote one in the scratch copy only. Its first run failed, and the fault was in my test, not in Better Auth: the session column is `timestamp` without time zone in UTC and this machine is on IST, so `now() - 1 hour` landed 4.5 hours in the future. Corrected to a UTC value; both cases pass.
- **Organisation switching: NOT TESTED, no such journey exists.** Caterly sets the active organisation automatically at sign-in (`setActiveOrganization` in `src/lib/auth/require-session.ts`), which the login specs exercise. There is no user-facing switcher or multi-business UI.
- **Ownership flows: NOT TESTED, none exist.** There is no ownership-transfer feature in Caterly today (searched `src` and `e2e`).
- **Not run:** the other roughly 68 spec files in the copy (orders, menus, billing and so on), which do not touch authentication directly.
- **Unrelated failures:** none in the specs run.

**The two host-routing failures, revisited.** In the main repo, "the catering root shows the kitchen sign-in directly" and "a signed-in caterer who opens the catering root lands on the Dashboard" fail on the original code too (see Task 5). The same two tests **pass** in the scratch copy on port 3010 with Better Auth 1.7.15 (2 of 2). **Correction (see `docs/identity-spike-review-followup-report.md`):** this paragraph originally said the failures were not a Better Auth version issue; that was not established when I wrote it. The follow-up investigation did establish it: the cause is the long-running main dev server on port 3000, not the code, the version, the database or the working tree.

## Task 5. Caterly forwarded-host fix (the only change outside scratch)

**Change.** `requestHost()` in `src/lib/routing/hosts.ts` reads `Host` only. The same pattern in `src/modules/storefront-visits/visits.ts` is the same. Nginx is unchanged: it already sets `Host $host` for Caterly and Ops. The unit test in `src/lib/routing/__tests__/hosts.test.ts` now asserts that a forwarded value is ignored.

**Tests (`e2e/host-routing.spec.ts`, run one test at a time, headless).**
- New "a forged X-Forwarded-Host does not change which host a request is served as": **failed before the fix** (bare host with a forged header got 200 instead of 404), **passes after**. It covers the bare host, the ops host, the catering host with an ops value and with an unexpected host.
- New "direct access to the app, bypassing the proxy, cannot borrow a product host with a forged header" (request to `127.0.0.1` with a forged header, `/api/health` still 200): **PASS**. The follow-up run shows it fails against the original code and passes with the fix (`docs/identity-spike-review-followup-report.md`, section 4).
- The other 4 existing tests that do not sign up a caterer pass. The routing unit tests pass (8 of 8). `tsc --noEmit` reports nothing.

**Two pre-existing failures, recorded, not counted as regressions.** "the catering root shows the kitchen sign-in directly" and "a signed-in caterer who opens the catering root lands on the Dashboard" fail with a navigation loop at `catering.localhost:3000`. I restored the original `hosts.ts` temporarily and both **still failed**, so they are not caused by this change. They pass in the scratch copy (Task 4). Not diagnosed.

## Remaining limitations across the work

- Nothing here ran against real Nginx, Cloudflare, a hosted database, or the real retry schedule (1 minute to 24 hours, 7-day parking).
- The scratch product has no cookie cache and no real product permissions; Platform and Ops were not involved.
- All Logto items remain NOT TESTED.
- Better Auth stays the leading candidate on this evidence only; no provider has been selected.

## Decisions needed from you

1. **Generation registry:** where does the registry live in production (a host file or secret that is backed up separately, plus an off-host copy)? And should the rule for a lost registry be "highest product-reported generation plus one"?
2. **Sessions on restore:** confirm that a restore ends every OP session (everyone signs in again once), or ask for a narrower rule (for example only sessions created before the backup time).
3. **Existing Caterly sessions at cut-over:** end them when mapping is introduced, or leave them until the recovery pull ends them?
4. **Guard monitoring:** confirm `guard_health()` and the DDL audit become required monitoring, and that guards are only re-enabled with `ENABLE ALWAYS`.
5. **Membership reconciliation on a generation change** is not modelled: do you want it in M1 or after?
6. **The two failing main-repo host-routing tests:** investigate now, or leave until you decide?
7. **E1:** unchanged, not granted; F2.1.4 has not started.
