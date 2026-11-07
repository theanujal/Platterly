# Identity spike: review follow-up report (2026-11-02)

Follows `docs/identity-spike-next-validation-report.md` (one sentence corrected, see section 5). Scratch only, except that the diagnostic of section 5 read the main repository and its running dev server without changing them. Nothing was committed, no scratch database or project was deleted, no provider was chosen, and F2.1.4, Logto, D1, M1, Platform or Ops authentication, staging and production were not touched. Sections 1 to 7 were written before the dev server restart; the main dev server on port 3000 was then restarted with your approval (section 8). Sections 8 to 13 are the update after your second review.

## 1. Task 3: what the new controls do and do not give you

**A PostgreSQL superuser (or the table owner) can still bypass every one of these controls.** They can disable or drop the guard triggers, drop the event triggers, replace `guard_health()`, edit or truncate `guard_ddl_audit`, and stop whatever runs the monitor. `ENABLE ALWAYS`, the DDL event trigger and `guard_health()` protect against mistakes and non-privileged code, and they make the common bypass visible. They do not stop a determined privileged operator.

| Question | Answer today (scratch) | Proposed for production (not built, NOT TESTED) |
|---|---|---|
| What happens when `guard_health()` detects a compromised guard? | It returns one row per problem. **Nothing consumes it yet.** In the scratch run I read it by hand (it flagged the downgrade by the old PM2 test, state `O`). | A monitor runs it every minute and pages a named person on any row. The Platform's health endpoint reports unhealthy. |
| Does the application fail closed? | **No.** Nothing in the scratch Platform checks guard health, and sign-in and token issuance carry on. | The Platform checks guard health at start and every few seconds. On any problem it refuses new sign-ins and token issuance (503) and keeps serving only what already exists. Needs your decision on whether a monitor error should also block (fail closed on monitor failure). |
| Can the same privileged operator disable monitoring? | **Yes.** They can alter the function, the event triggers or the audit table, and can stop the job. | Run the monitor from a different host with a read-only role held by a different person, and compare the hash of the `guard_health()` definition and the trigger list against a value kept outside the database. This reduces the risk but cannot remove it. |
| Are security events exported to an independently controlled destination? | **No.** `guard_ddl_audit` and `revocation_audit` live in the same database. A superuser can rewrite them, and a restore rolls them back. | Ship them continuously to an append-only destination (for example immutable object storage or a log service) controlled by someone other than the database operators, and enable server-side DDL logging into the same destination. Destination and owner are your decisions. |

**PM2 is kept, unchanged.** `r8a-mechanism.mjs` line 53 still asserts that a superuser can bypass the guard and still reports FAIL (re-run result: 7 of 8). A normal application failure means application code or an application role got past a control. PM1 tests that and passes: the business role, the Better Auth role, the dispatcher and the owner role are all refused. PM2 deliberately acts as the one actor PostgreSQL cannot restrict. Its FAIL records that the control gap exists and that the remaining protection is detection plus procedure, not prevention. Replacement checks PM2a to PM2d show what is closed (replica role) and what is detected (disable, drop). They sit beside PM2, not instead of it.

## 2. Task 2: limitation recorded

The eight per-session results (SM1 to SM8) used cookie jars sent over HTTP. A cookie jar is not a real browser or device: no real browser cookie handling, tabs, storage partitioning, redirects, or device differences took part. **Real-browser, multi-device testing is a later validation requirement** and is NOT TESTED. The scratch design is accepted as the working design.

## 3. Decisions recorded (design only, no implementation authorised)

**Generation registry.** Accepted in principle. Production requirements to preserve:

| Requirement | Status in the scratch build |
|---|---|
| Generation is monotonic | Built and tested: new generation is max(registry, restored database) + 1 (GN1, GN7); products refuse a lower one (GN5, GN6). |
| A restored database cannot roll it back | Built and tested: an old backup restored again still advances it (GN7); the registry is outside the database. |
| A failed or incomplete restoration leaves services unavailable | Partly tested. The registry is written before the database, so a crash between the two leaves the registry ahead and the Platform refuses to start. I tested the resulting state (GN2). I did not kill the procedure mid-run. The procedure also does not yet run `guard_health()` at the end. |
| Products reconcile session and access state before normal traffic resumes | **Not met.** A product reconciles on the first event of the new generation (GN3). Until that event arrives it keeps serving its existing sessions. A mechanism is needed, for example the restore procedure refusing to open sign-in until every registered product has acknowledged the new generation, or products checking the generation on session validation. This is a design gap for you to decide, not built. |

**OP sessions on restore.** Decided: invalidate all OP sessions associated with the restored identity state. The scratch impact (56 sessions of 43 users) is accepted for this recovery scenario; users authenticate again. Design decision, not production implementation approval.

**Existing Caterly sessions at the first identity migration.** Preferred approach: forced reauthentication. No automatic mapping by email address or user id. No migration is authorised.

## 4. Task 5: direct-access test against the original implementation

Run in an isolated clone of the current main working tree (own `.next`, own port 3020, same `node_modules` and Better Auth 1.7.4), with the two Task 5 files first restored to the original git HEAD version and then to the fixed version. The main repository and its dev server were not used.

| Test | Original implementation | With the fix |
|---|---|---|
| "a forged X-Forwarded-Host does not change which host a request is served as" | **FAIL** (bare host with forged header: expected 404, received 200) | **PASS** |
| "direct access to the app, bypassing the proxy, cannot borrow a product host with a forged header" | **FAIL** (request to 127.0.0.1 with forged header: expected 404, received 200) | **PASS** |

No routing changes beyond the two files were made.

## 5. The two failing host-routing tests: root cause

Tests: "the catering root shows the kitchen sign-in directly, without redirecting" and "a signed-in caterer who opens the catering root lands on the Dashboard".

**Root cause: the long-running main Caterly dev server on port 3000 is stuck in a rebuild-and-reload loop.** It has been running since Nov 1 18:05 (22 hours). Whenever a browser connects, it pushes `building`, `sync`, `reloadPage` messages about 15 times a second, so every page reloads about 30 times a second (about 115 navigations in 4 seconds, on `/`, `/privacy` and a 404 page alike). The sign-in form never settles, so the tests cannot fill it. This is why they fail on the original code too.

| Check | Result |
|---|---|
| Does the loop depend on the page? | No. `/`, `/privacy`, a missing page: 116, 124, 131 navigations in 4 s. |
| Does it happen on the other dev servers (Site 3100, Ops 3200)? | No: 2 navigations. |
| Does it happen with no browser (idle, or `curl` only)? | No. The server is quiet and answers in about 19 ms. It starts when an HMR websocket connects. |
| Is a source file changing? | No. In a 3-second window during the loop only the server's own `.next/dev/trace` and log changed. |
| Working-tree changes? | Ruled out. A fresh dev server on a clone of the same working tree, with Better Auth 1.7.4, the same database and the same `.env` apart from the port: 2 navigations, and the two tests pass (2 of 2). |
| Better Auth version (1.7.4 vs 1.7.15)? | Ruled out. The 1.7.4 clone passes. This **corrects** the earlier report, which had said the version was not the cause before that was shown. The corrected sentence is in the earlier report. |
| Database or environment configuration? | Ruled out. The clone used the same dev database and `.env`; `next.config.ts` is identical in the main repo and the scratch copy. |
| Playwright authentication state? | None. The config has no `storageState` or global setup, and every test signs up its own caterer in a fresh browser context. |
| Differences between main and the scratch copy? | `src` is byte-identical apart from the Task 5 files; the copy has Better Auth 1.7.15, its own database and port 3010. Neither explains it. |
| On-disk `.next` cache? | Ruled out. A copy of the main `.next` into the clone does not reproduce it. The bad state is in the running process. |
| The trigger? | **Not identified.** Candidates tested one at a time on the healthy clone and none reproduced the loop: a file written into `node_modules/.vitest-cache`, `tsconfig.tsbuildinfo` modified, `package.json` touched and edited. For context, the main `package.json` was edited at Nov 1 20:49, after the server started, and a log burst of repeated "Compiled in 1ms" shows the problem was already present that evening. That is a coincidence in time, not a demonstrated cause. |

**Update:** the restart was approved and done; see section 8. The original proposal read: restart the main dev server (stop the process on port 3000 and run `npm run dev`; per the migrate-and-restart habit). Evidence for it: a fresh server on the same tree and database passes both tests and shows no loop. After the restart I would run those two tests once, plus the two new host-routing tests, and report. I did not restart the server because it is the shared dev instance and you asked for a root cause and a proposed fix separately. If it recurs after a restart, the trigger needs a separate investigation.

## 6. What remains open

- Decisions in section 1 (fail closed on guard problems, monitor ownership, external audit destination) and the product-reconcile gap in section 3.
- Real-browser and multi-device testing; real Nginx; hosted databases; the real retry schedule; Logto items. All NOT TESTED.
- Better Auth stays the leading candidate on this evidence only. The provider decision is open.

## 7. Scratch artifacts

New: `main-iso/` (1.6 GB clone of the main working tree, port 3020 server stopped) in the session scratchpad `/private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/73faa9a7-0feb-480e-8679-43add0cd3cc3/scratchpad/`, with the probe scripts `probe.mjs` and `probe2.mjs`. Nothing deleted. All scratch servers (4510, 4601, 4602, 3010, 3020) are stopped. (Superseded by section 8: the main dev server was restarted afterwards.)


---

# Update after the second review (2026-11-02, later)

Scratch only, except the approved local forwarded-host fix and the approved dev server restart. No commits or pushes, no scratch database or project deleted, nothing changed in the main Platform or Ops authentication, no provider selection, no F2.1.4, D1 or M1, no staging or production. `git status` for `src/` and `e2e/` shows only the Task 5 files.

## 8. Main dev server restart (port 3000)

**Before.** Captured to `.../scratchpad/devserver-before-restart/`: process list with start times (parent 5876 and server 5880 started Nov 1 18:05, 22 hours; two Turbopack workers 5952, 5953), the listening socket, the full `next-development.log` and the `trace` file.

**Restart.** Only those four processes were stopped and `npm run dev` was run again with no change to code, dependencies or configuration. Site (3100), Ops (3200) and Platform (3300) were not touched and stayed up.

**Result: the reload loop returned.**
- Right after the restart, probes of `/` and `/privacy` showed 129 and 140 navigations in 4 seconds (the same pattern as before, `building`/`reloadPage` frames), and the two tests failed (2 failed).
- A second run in the following minute: test 1 passed, test 2 failed (1.3 minutes, the sign-up form never settled).
- About 3 minutes after the restart the loop stopped by itself. The server log shows about 2,370 "Compiled in 1ms" entries across those minutes, then 10.
- After that: 3 probes with 2 navigations each; both tests **pass (2 of 2)**; test 2 alone also passed in 3.1 s and 2.8 s.
- As instructed I stopped fixing and investigated. No further restart and no code, dependency or configuration change was made.

**Root cause status: not established.** What this adds to section 5:

| Question | Finding |
|---|---|
| Is it just stale state in a 22-hour process? | No. A freshly restarted server looped too, for about 3 minutes. My statement in section 5 that "the bad state is in the running process" was therefore too narrow. |
| Project-root contents (`apps/` 3.6 GB, `.git`, `test-results/`, `playwright-report/`) | Ruled out as a plain cause: a fresh clone containing all of them did not loop in 8 probes over 2 minutes from startup. |
| File churn in sibling app folders (a 7-second write loop into `apps/ops/.next`, `apps/platform/src`, `docs/`) | Makes the server send `building` messages (21 to 25) but produced no reload loop. |
| Warm restart, with and without changed files (`package.json`, `tsconfig.json`, a source file touched) | No loop. |
| Working tree, Better Auth version, database, `.env`, Playwright auth state | Ruled out (section 5). |
| Open browser tabs or an IDE preview reconnecting to the server | **Not excluded.** No client was connected when I looked afterwards, but I cannot see what was connected during the first minutes. This is the most plausible remaining difference from every isolated test, since my clones never had a long-lived client. |
| The trigger | **Not identified.** I could not reproduce the loop anywhere except the real main server, in the first minutes after its start. |

**Proposed next diagnostic, for your approval (not done):** if it recurs, capture at that moment the list of connected clients (`lsof` on port 3000) and the websocket frames (as in my probe), and note which browser tabs or previews you have open on `catering.localhost:3000`. If a reproduction is wanted, close those tabs, restart once more, and watch the first 5 minutes. I made no fix.

## 9. Guard health enforcement, role separation and independent audit (scratch)

**Retained:** `ENABLE ALWAYS` on the guard triggers, the DDL event trigger, `guard_health()`, the original PM2 test (unchanged) and the replacement checks PM2a to PM2d.

**Design.**
- **Monitor service** (`guard-monitor.mjs`) is its own process with its own database role `op_monitor`, which is read-only: it may call `guard_health()` and read the audit, generation tables and catalogs, and nothing else. Every second it runs `guard_health()` and three further checks against a **baseline file held outside the database**: the hash of the `guard_health()` source, the exact list of event triggers (missing, disabled or unexpected ones are flagged), and whether `guard_ddl_audit` has fewer rows than were already exported.
- **Verdicts are signed.** The monitor signs each verdict (`healthy`, `problems`, timestamp, database name) with an Ed25519 **private key readable only by the monitor owner** (file mode 600, not in the provider's environment). The provider holds only the public key.
- **The provider fails closed** (`op6.mjs`). New sign-ins, sign-ups, authorisations, consent, token issuance and password reset need a fresh (3 s in scratch), correctly signed, healthy verdict for its own database. Anything else gives 503: unhealthy, monitor unreachable, bad signature, stale, wrong database. **Sign-out, reading a session and revocation are never blocked.**
- **Independent append-only export.** Every new `guard_ddl_audit` row and every health transition goes to a separate sink process (`audit-sink.mjs`: own directory, own token, no delete or edit endpoint, each record hash-chained to the previous one, appends refused if the chain is broken). The monitor advances its export watermark only after the sink accepted the records. In production the sink must be a store the database operators cannot rewrite; here it is a local file, which proves the protocol and not the independence.
- **Export outage is detective, not blocking.** Sign-in stays open while the sink is down (the guard itself is healthy), the monitor reports the lag, and the backlog is sent once and in order when the sink returns. Whether a long outage should also close the provider is a decision for you.

| ID | What is checked | Result | Evidence |
|---|---|---|---|
| G1 | Healthy: with the guard intact the monitor reports healthy and the provider signs people up and in | **PASS** | sign-up 200, sign-in 200; verdict {"healthy":true,"problems":[]} |
| G2 | A disabled guard fails closed: new sign-ins, sign-ups and authorisations get 503 within seconds; an existing session can still be read and signed out (revocation is never blocked) | **PASS** | refused after 410 ms; sign-in 503 (guard unhealthy: guard trigger not ENABLE ALWAYS: guard_session_data_delete (state D)); sign-up 503; authorize 503; existing session readable true; sign-out 200 |
| G3 | Once the guard is restored (ENABLE ALWAYS) the next healthy verdict reopens sign-in without restarting anything | **PASS** | reopened after 539 ms |
| G4 | A privileged operator who replaces guard_health() with a version that always says healthy, or drops the DDL event trigger, is caught against the baseline held OUTSIDE the database: sign-in fails closed until it is put back | **PASS** | forged function: refused after 413 ms (guard unhealthy: guard_health() is not the approved definition (hash differs from the external baseline)), reopened after restore 536 ms; dropped event trigger: refused after 414 ms (guard unhealthy: event trigger missing: guard_ddl_watch), reopened 998 ms |
| G5 | If health cannot be verified (monitor stopped) the provider fails closed; restarting the monitor reopens it | **PASS** | refused after 409 ms (cannot verify guard health: monitor unreachable); reopened 374 ms after the monitor restarted |
| G6 | A forged 'healthy' verdict (wrong key) and a replayed old genuine one (stale) are both refused: the provider holds only the public key and a freshness limit | **PASS** | forged: 503 (cannot verify guard health: verdict signature invalid); replayed after 4 s: 503 (cannot verify guard health: verdict is stale) |
| G7 | Monitoring is owned separately: the application role cannot touch, call or read any monitoring object; the monitor role is read-only and cannot change anything; the signing key is not in the provider's environment | **PASS** | op_runtime: disable a guard trigger: refused; op_runtime: drop the DDL event trigger: refused; op_runtime: replace guard_health(): refused; op_runtime: call guard_health(): refused; op_runtime: read the DDL audit: refused; op_runtime: truncate the DDL audit: refused; op_monitor: delete session rows: refused; op_monitor: write the outbox: refused; op_monit... |
| G8 | Security events reach the independent sink: every DDL audit row and every health transition, in a hash chain that verifies | **PASS** | chain {"ok":true,"records":113,"head":"c86af5ae5108a7b0e8da497a9d8342ff4336bfabdca2b0339ea79e72a7bde9f5"}; records by type {"ddl":67,"guard_health":46}; DDL rows in the database 5 |
| G9 | The sink only appends: no token = 401, DELETE/PUT = 404; editing a stored record out of band is detected by verification and appends are refused while the chain is broken | **PASS** | no token 401; DELETE 404; PUT 404; after editing record 2: verify {"ok":false,"at":2,"why":"record content does not match its hash"}; append while broken 409; original restored: true |
| G10 | If the in-database audit is truncated, the history is still in the sink and the monitor flags the shrinkage (fail closed until the monitor owner acknowledges after investigation) | **PASS** | refused after 408 ms (guard unhealthy: guard_ddl_audit shrank (0 rows now, 5 already exported): rows were deleted); DDL records in the sink before 67, after 67 |
| G11 | While the sink is down the monitor records an export lag but the guard is healthy so sign-in stays open (export is detective); when the sink returns the backlog arrives once, in order, and the chain verifies | **PASS** | during outage: exportLag 2, sign-in 200; after: duplicates 0, in order true, chain {"ok":true,"records":117,"head":"d0d1c83aa4145346a4c990d6cad0d9ce516477efd89eef57a7d13eba5851434a"}; acknowledged G10 shrinkage and reopened in 60 ms |

**Findings while testing.** (1) First G11 run failed because my check compared numbers with string ids (`bigserial`); the data was correct. (2) After the recovery work changed the live database, the same check counted rows from several databases together; counting per source database fixed it. Earlier result files are kept (`r10a-results.first-run.json`, `.second-run.json`).

**Infrastructure trust boundary (documented as requested).** A PostgreSQL superuser, the table owner, and anyone who can run as the monitor owner, replace the baseline file, or stop the processes remain able to defeat these controls. The controls make that visible and fail closed for new sign-ins; they do not prevent it. G4 shows the specific cases a privileged operator can no longer do silently: replace `guard_health()` with an always-healthy version, or drop the event trigger. **Not covered:** a superuser who changes the baseline file, the monitor's private key, or the sink itself. Separate custody of those three (monitor owner, sink owner, database operators being three different people) is the procedural control.

## 10. Hybrid generation recovery (scratch)

**Sequence implemented** (`recovery.mjs`, run from an orchestrator process; every restore goes into a NEW database and never overwrites):

| Step | What happens | Where |
|---|---|---|
| Pre-flight | The registry's required-product list must equal the products registered in the live platform; any difference stops everything before a single change. | `run()` |
| 1. Enter recovery mode | The registry (outside every database) is set to `recovering` with a recovery id and a start time; the provider reads it on the next request (file mtime check, no cache delay) and refuses new sign-ins; every product is sent a signed **recovery hold**, stored durably in its own database, so it stays closed even if the provider then disappears. | registry, `/platform/recovery-hold` |
| 2. Advance the external generation | Registry generation +1 (never from the restored database). | registry |
| 3. Restore and invalidate | Restore into a new database, record the new generation in it, end every OP session through the revocation service (events in the new generation), set up the monitoring role, start the monitor and the provider **in recovery mode** (it must be up so products can reconcile). | orchestrator |
| 4. Reconcile each required product | Signed call to each product's `/platform/recover`. The product discards the old watermarks, adopts the generation, ends sessions whose OP session is not live, ends sessions in businesses the person no longer belongs to. | product |
| 5. Verify | The product itself recomputes four things against the platform: local generation, watermarks (all keyed by the new generation), session state, access state. | product |
| 6. Acknowledge | Only if all four are true does the product store an acknowledgement and return it signed. The orchestrator accepts it only if the signature, the recovery id, the generation, the product id and all four verifications are right. | orchestrator |
| 7. Resume | Only when every required product has acknowledged does the orchestrator set the registry to `normal` with a completion time. | registry |

**Generation check on every session validation** (`sessionGate()` in the product): platform mode `recovering` closes it; generation equal and database generation equal opens it; **platform ahead** closes the request and starts a reconciliation (never an acknowledgement); **platform behind** (or registry ahead of the platform database) closes it, raises an alarm and does not reconcile or adopt the lower generation. Platform **unreachable** is not a mismatch: sessions continue under the approved outage policy, bounded by the time since the last verified generation (24 hours; 4 seconds for one product in the test). A recovery hold is cleared only when the platform is normal, this product acknowledged the platform's current recovery, and that recovery completed after the hold began.

| ID | What is checked | Result | Evidence |
|---|---|---|---|
| R1 | Full sequence: recovery mode, external generation +1, restore with every OP session invalidated, products reconcile, verify, explicit acknowledgements from both products, then (and only then) normal traffic | **PASS** | steps 1@23ms 2@28ms 3@2076ms 4@2802ms 6@2802ms 7@2807ms; registry normal gen 15; 18 samples while recovering: provider sign-in never 200 and product session validation never open: true; after resume 4 samples all open: true; sessions before {"A1":true,"B1":true,"A2":true,"B2":true} after {"A1":false,"B1":false,"A2":false,"B2":false}; old cookie at app1: {... |
| R2 | A required product that is offline blocks the resume: it is reported as failed, the registry stays in recovery mode, provider sign-in and the other product's session validation stay closed, and it is not skipped | **PASS** | result ok=false; failed {"uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC":"unreachable (ECONNREFUSED)"}; acked ["lyqrFZruKXBBrOYGVSjFersUInEzoVTe"]; registry recovering; provider sign-in 503; app1 session validation {"ok":false,"reason":"recovery rec_402469d669 hold: platform recovery in progress"} |
| R2b | When the product returns, the same recovery is resumed (not restarted), the product reconciles and acknowledges, and only then does traffic resume | **PASS** | app2 right after returning (recovery still open): {"ok":false,"reason":"platform recovery in progress"}; resume result ok=true, acked ["lyqrFZruKXBBrOYGVSjFersUInEzoVTe","uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC"]; registry normal gen 16 |
| R3 | A product whose reconciliation does not verify (sessions still alive that the platform does not know) answers 409 with its evidence and gives no acknowledgement; the recovery stays blocked | **PASS** | failed {"lyqrFZruKXBBrOYGVSjFersUInEzoVTe":"HTTP 409: {\"error\":\"reconciliation did not verify; no acknowledgement\",\"reconcile\":{\"users\":0,\"failed\":0,\"revoked\":0,\"skipped\":true},\"verified\":{\"generation\":true,\"watermarks\":true,\"sessions\":false,\"access\":tru"}; acked ["uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC"]; registry recovering |
| R4 | Receiving the new generation's events is not an acknowledgement: after every event is delivered, app1 has no acknowledgement for this recovery, its session validation and the provider stay closed, and the recovery stays blocked | **PASS** | app1 acknowledgements for this recovery: 0; app1 local generation 17; app1 session validation {"ok":false,"reason":"recovery rec_82ab20f048 hold: platform recovery in progress"}; provider sign-in 503; registry recovering |
| R3b | With the fault cleared, the product reconciles, verifies and acknowledges on a second explicit request; only then does traffic resume | **PASS** | result ok=true; acked ["lyqrFZruKXBBrOYGVSjFersUInEzoVTe","uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC"]; registry normal gen 17 |
| R5 | Acknowledgement validation: only a correctly signed acknowledgement for this recovery, this generation and this product, with all four verifications true, counts | **PASS** | valid: as expected; wrong generation: as expected; other recovery (stale ack): as expected; other product: as expected; forged signature: as expected; stale timestamp: as expected; access not verified: as expected; sessions not verified: as expected; empty response: as expected |
| R6a | Platform generation ahead of the product (product missed a change): the very first session validation fails closed (503) and starts a reconciliation; it never acknowledges; once reconciled the product's generation is current, the dead OP session is gone and the live one works | **PASS** | first request: 503 (generation mismatch (platform 17, product 16): reconciling); generation current after 306 ms; the signed-out session was still alive before: true, after: false; live session after: true; reconcile detail {"via":"session-validation","users":206,"failed":0,"revoked":1} |
| R6b | Platform generation BEHIND the product (platform rolled back without the procedure): session validation fails closed, stays closed, raises an alarm, and does NOT reconcile or adopt the lower generation | **PASS** | first 503, later 503 (platform generation 17 (database 17) is behind this product's 22); product generation unchanged true; alarms 2 |
| R6c | Platform in recovery mode: product session validation and provider sign-in both fail closed; they reopen when the platform says normal | **PASS** | during: product 503 (platform recovery in progress), provider sign-in 503; after normal: product 200 |
| R6d | Registry and platform database disagree (registry ahead of the database): session validation fails closed instead of trusting either | **PASS** | product answered 503 (platform generation 18 (database 17) is behind this product's 17) |
| R6e | Platform unreachable is not a mismatch: existing sessions continue under the approved outage policy, bounded (app1: 24 h default, app2 set to 4 s for this test: continues at first, then fails closed) | **PASS** | just after the outage: app1 true, app2 true; 4.5 s later: app1 true, app2 false (platform unreachable and no recent verified generation); both reopen when the platform returns |
| R6f | A hold left from an older recovery does not wedge a product that acknowledged the platform's current recovery (it clears); a product that did NOT acknowledge the current recovery stays closed even though the platform is normal | **PASS** | stale hold: gate {"ok":true}, hold rows left 0; current ack removed: {"ok":false,"reason":"recovery rec_82ab20f048 hold: this product has not acknowledged the current recovery"}; ack restored: {"ok":true} |
| R6g | A hold that began after the platform's last completed recovery is NOT cleared by the platform still saying 'normal' for that older recovery | **PASS** | gate {"ok":false,"reason":"recovery rec_fresh hold: no recovery has completed since this hold began"} |
| R7 | Pre-flight: a registered product missing from the required list, or a required product that is not registered, blocks the recovery before anything changes (registry, generation and databases untouched) | **PASS** | A: pre-flight: required-product list and registered products differ (not registered: none; registered but not required: uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC); nothing was changed; B: pre-flight: required-product list and registered products differ (not registered: client-that-is-not-registered; registered but not required: none); nothing was changed; registry... |
| R8 | Crash after step 2: the registry is in recovery mode at generation+1; the provider that is still running refuses new sign-ins; products stay closed even with the provider down (durable hold); the old database cannot start | **PASS** | registry recovering gen 18 (was 17); provider sign-in 503; app1 with provider up {"ok":false,"reason":"recovery rec_e214bc2615 hold: platform recovery in progress"}, with provider down {"ok":false,"reason":"recovery rec_e214bc2615 hold: platform unreachable"}; old database start: exit 3 "REFUSING TO START: database generation 17 is behind the external reg... |
| R8b | The interrupted recovery is resumed from before the restore (same id, same generation) and completes with both acknowledgements | **PASS** | ok=true; acked ["lyqrFZruKXBBrOYGVSjFersUInEzoVTe","uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC"]; registry normal gen 18 |
| R9 | Access state is verified, not assumed: a product session working in a business the person does not belong to makes verification fail (so no acknowledgement) and is ended by reconciliation | **PASS** | verify before: access true; after tampering: access false (1 bad session); reconcile ended 1; verify after: access true |

**Product acknowledgement failure scenarios covered:** product offline (R2, R2b); reconciliation that does not verify (R3, R3b); events delivered but no acknowledgement (R4); forged, stale, wrong-recovery, wrong-generation, wrong-product and unverified acknowledgements (R5); required-list mismatch (R7); crash between steps 2 and 3 (R8, R8b).
**Session-validation generation scenarios covered:** platform ahead (R6a), behind (R6b), in recovery (R6c), registry ahead of the database (R6d), platform unreachable (R6e), stale or unrelated holds (R6f, R6g).

**Defects found and fixed during testing (kept visible, earlier outputs saved as `r10b-first-attempt.out`, `r10b-second-attempt.out`, `r10b-third-attempt.out`):**
1. Harness race: sign-up was attempted in the few hundred milliseconds in which the provider correctly still said "recovering" after a resume; the test now waits for it to open.
2. **Design weakness (R6e):** a recovery hold cleared only when the platform's current recovery id equalled the hold's own id, so a product that missed a later recovery's hold would stay closed forever. Changed to "acknowledged the platform's current recovery".
3. **Regression I introduced with that change (R1, R8):** a product's cached "normal" from the previous, already completed recovery satisfied the new rule and released a fresh hold at once. Fixed by requiring the recovery to have **completed after the hold began** (registry `startedAt`/`completedAt`); R6g tests this directly.
4. **Provider registry cache:** a 300 ms cache left a window after "enter recovery mode" in which a sign-in still passed (R8 saw HTTP 200). The provider now re-reads the registry whenever its file changes, so the next request is already refused.

## 11. Remaining limitations

- Superuser, table-owner and operator access remain an infrastructure trust boundary (section 9). Key custody for the monitor key, the baseline file and the sink is procedural.
- The sink is a local file; production needs an independent immutable store and a named owner other than the database operators.
- The recovery orchestrator is a single scratch script run by one operator. There is no second approver, no waiver of a required product (deliberately none: a product that cannot acknowledge blocks resume), and no operator tooling.
- A product that is reachable by users but unreachable by the orchestrator at step 1 (a network partition) does not receive the hold and, if the platform is then down for the restore, would continue under the outage policy until the platform returns in recovery mode. Products that are down cannot serve anyone, and every product closes as soon as the platform is back in recovery mode.
- Membership changes made after the backup are lost by a restore. Reconciliation then treats the restored memberships as the truth. This is an inherent consequence of restoring and needs a decision (see below).
- Scale: reconciliation covered about 195 users per product in well under a second here. Production volumes were not tested.
- Not tested: real Nginx, Cloudflare or firewall behaviour; real browsers and devices (all sessions are cookie jars); hosted or replicated PostgreSQL; the real retry schedule; the unreachable-platform outage beyond a 4-second bound; clock skew between hosts (the hold uses the registry's own timestamps for both sides of the comparison, which avoids it, but multi-host registry distribution was not modelled); the main Platform application (nothing was implemented there).
- Existing Caterly sessions: forced reauthentication, as decided. Nothing was built or tested for any migration.

## 12. Decisions still open for you

1. Should an export outage longer than some limit also close the provider (fail closed), or stay detective?
2. Who owns the monitor key, the baseline file and the sink in production, and where does the sink live?
3. Should the registry be distributed to more than one host for the recovery, and who may run the orchestrator (single operator or two-person)?
4. Is losing membership changes made after the backup acceptable for the restore scenario, or should memberships be re-applied from an independent log?
5. The unreachable-platform policy during a recovery: keep the approved 24-hour continuation for products that did not receive the hold, or close them too?
6. The dev server loop: continue the diagnostic described in section 8?

## 13. Scratch artifacts added

New code in `idp-spike/`: `op6.mjs`, `rp7.mjs`, `recovery.mjs`, `end-sessions.mjs`, `guard-monitor.mjs`, `audit-sink.mjs`, `procs.mjs`, `start-rp7.mjs`, `poller.mjs`, `setup-monitor.sql`, tests `r10a-guard.mjs`, `r10b-recovery.mjs`, results `r10a-results.json`, `r10b-results.json`. New outside it: `monitor-owner/` (private key, mode 700), `audit-sink/` (the chained log), `control/` (public key, baseline, registry, backups), `main-iso/` (clone of the main tree). New scratch databases: the recovery targets `spike_rec1_*` to `spike_rec8_*` (the live one at the end is `spike_rec8_mvz51oh6`, registry generation 18, mode normal) and the earlier ones. Nothing deleted. All scratch servers are stopped; Site, Ops, Platform and the main dev server on port 3000 are running.


---

# Update after the third review (2026-11-02, end of session)

Scratch only, plus the two already-approved local changes (forwarded-host fix, dev server restart). No commits or pushes. No scratch database or project deleted. No change to Platform or Ops authentication. No provider selection, F2.1.4, D1, M1, staging or production. The session was stopped by AJ before a final read-through of the evidence, so the tables below are generated from the result files, not retyped.

## 14. Decisions recorded from AJ's third review

| # | Decision | Where it is built or documented |
|---|---|---|
| 1 | Do not close the provider at once for a temporary audit-export outage. Use a durable local outbox with retries and monitoring, with configurable thresholds for oldest undelivered event, queue capacity and outage duration. Privileged administrative operations fail closed when audit delivery cannot be guaranteed. Ordinary authentication fails closed when the buffer reaches its safe capacity or the outage threshold is exceeded. Sign-out and revocation are never blocked. **Production thresholds are NOT proposed**; they are infrastructure-design decisions. | Section 15 |
| 2 | Independent ownership of the monitor signing key, the baseline file and the external audit sink. The monitor key stays outside the identity provider. | Section 16 |
| 3 | Two-person authorisation for identity database recovery (different authorised people; record both identities, timestamps and reason). Restricted emergency procedure documented, with no permanent single-person bypass. | Sections 17, 18 |
| 4 | **Critical, required architectural condition:** losing membership changes made after the backup is NOT acceptable. The recovery source must survive restoration; products must not acknowledge until access state is reconciled; if the history cannot be recovered the affected access stays blocked until verified; old permissions are never silently restored. | Section 19 |
| 5 | The 24-hour continuation applies to ordinary IdP outages only, NOT to identity database recovery. During recovery, products without a confirmed hold, or unable to verify the current generation, fail closed; products reconcile before acknowledging; traffic resumes only after all required acknowledgements. | Section 20 |
| 6 | Dev server: restart accepted; both tests passing is enough. Stop investigating the reload loop unless it returns; if it does, capture connected browser and IDE-preview clients before changing anything. | Section 8 (unchanged) |

## 15. Audit export outbox and the administrative-operation gate (decision 1)

**Built (scratch).** The monitor (`guard-monitor2.mjs`) now writes every audit row and health transition to a **durable local outbox** (fsynced file) before anything else, and delivers in order with exponential retry. The sink accepts an idempotency key, so a crash between "delivered" and "removed from the outbox" cannot duplicate a record. Rows are pulled from the database only while the outbox has room. The signed verdict carries the queue size, oldest age, outage duration, capacity, and two separate answers: `authAllowed` (ordinary sign-in, sign-up, authorisation, tokens) and `adminAllowed` (administrative operations such as client creation). The provider refuses with 503 and the stated reason when the relevant answer is false, or cannot be verified. Sign-out, reading a session and revocation are never gated.

**Thresholds are configuration** (`MON_QUEUE_CAP`, `MON_OLDEST_MS`, `MON_OUTAGE_MS`, `MON_ADMIN_MAX_AGE_MS`, retry settings). The values used in the tests (queue 6, oldest 4 s or 1.5 s, outage 6 s or 1.5 s) are **test values only**. The defaults in the file (1000 entries, one hour) are placeholders so that earlier suites keep working. **Decisions required during infrastructure design:** queue capacity, oldest-event limit, outage limit, administrative limit (the scratch rule is: any undelivered event or any outage closes administrative operations), retry/backoff, and how the outbox disk is sized and protected.

| ID | What is checked | Result | Evidence |
|---|---|---|---|
| A1 | Healthy and delivering: ordinary sign-in is open, and an administrative operation reaches the application (not refused by the audit gate) | **PASS** | sign-in 200; administrative request answered 401 by the application; verdict authAllowed true, adminAllowed true, queued 0 |
| A2 | A temporary export outage inside every threshold does NOT close ordinary authentication, but privileged administrative operations fail closed at once because audit delivery cannot be guaranteed | **PASS** | sign-in 200; administrative request 503 (administrative operations refused: audit export is down (981 ms); audit events are waiting for delivery (oldest 998 ms, administrative limit 0)); queued 2 (on disk 2), outage 981 ms |
| A2b | When the sink returns, the outbox drains in order, nothing is duplicated, the chain verifies and administrative operations are allowed again | **PASS** | drained after 319 ms; administrative request 401; 139 new sink records; duplicate keys 0; chain {"ok":true,"records":139} |
| A3 | When the durable buffer reaches its safe capacity, ordinary authentication fails closed (503) and the monitor stops pulling more rows into the buffer; sign-out is never blocked | **PASS** | queued 6 of 6; sign-in 503 (authentication refused: audit buffer at its safe capacity (6/6)); sign-out 200; audit rows in the database 31 (more than the buffer holds, so none were dropped) |
| A3b | After the sink returns, every audit row reaches it once and in order (none lost while the buffer was full) and ordinary authentication reopens | **PASS** | reopened after 783 ms; 41 rows for this database in the sink, in order true, highest id 68 = database highest 68; sign-in 200 |
| A4 | The oldest-undelivered-event threshold closes ordinary authentication on its own (buffer nearly empty, outage limit not reached); sign-out still works | **PASS** | oldest 2505 ms (limit 1500), queued 1; sign-in 503 (authentication refused: oldest undelivered audit event is 2505 ms old (limit 1500)); sign-out 200 |
| A5 | The export-outage-duration threshold closes ordinary authentication on its own; sign-out still works | **PASS** | outage 2495 ms (limit 1500), oldest 2506 ms; sign-in 503 (authentication refused: audit export has been down 2495 ms (limit 1500)); sign-out 200 |
| A6 | The outbox is durable: with events queued and the sink down, the monitor is killed (SIGKILL); on restart the events are still queued and are delivered exactly once, in a valid chain | **PASS** | queued before kill 3, on disk after kill 3, after restart 3; drained in 765 ms; duplicate keys 0; chain true |
| O1 | The baseline is owned by a different person from the monitor owner: an edited baseline, or one re-signed with any other key, makes the monitor unverifiable and the provider fails closed; the signed original reopens it | **PASS** | edited: refused after 482 ms (guard unhealthy: baseline is not signed by the baseline owner); re-signed with another key: refused (true); original restored: reopened after 1000 ms |
| O2 | Separate custody on paper and in the scratch layout: six separate directories (700), key files 600, five distinct credentials, and none of them (nor any private key) is in the identity provider's environment | **PASS** | directory modes {"monitor":"700","baselineOwner":"700","securityOwner":"700","operators":"700","sink":"700","journal":"700"}; monitor key file modes 600; credentials distinct: true; credential or key names found in the provider's environment: none (all scratch processes run as one OS user, so this proves the layout, not the O... |

(Results A1 to A6 are the outbox and gate; O1 and O2 are section 16.) The first run had three failures that were harness mistakes (a 400 ms gate cache, a queue that is briefly empty before held-back rows are pulled, and two directories left at mode 755). They are kept in `r11b-results.first-run.json`.

## 16. Ownership and custody (decision 2)

**Design (access boundaries).** Six separately protected locations, each with its own credential, and none inside the identity provider's environment:

| Asset | Owner (role) | Who can read | Who can write | Notes |
|---|---|---|---|---|
| Monitor signing key (Ed25519 private) | Monitor owner | Monitor process only | Monitor owner | The provider holds only the public key; a forged or replayed verdict is refused (G6). Rotation: new public key distributed to the provider by a recorded change. |
| Baseline file (`guard-baseline.json`) | Baseline owner, a different person from the monitor owner | Monitor (needs the public key to verify) | Baseline owner, signing every change | Edited or re-signed with another key makes the monitor unverifiable and the provider fails closed (O1). Changes need a recorded, approved procedure. |
| External audit sink (storage and read) | Sink owner, a third party from the database operators | Auditors | Append only, with the monitor's append token | No edit or delete endpoint; hash-chained; tamper-evident (G9). Production: an immutable store such as object-lock storage; the scratch file only proves the protocol. |
| Sink append token | Monitor owner | Monitor | Sink owner issues | Distinct from every other credential. |
| Operator list and security-owner key | Security owner | Everyone (public) | Security owner signs the list | Section 17. |
| Access journal (append and read tokens) | Journal owner | Recovery tooling (read) | Platform change code (append) | Section 19. |

**Verified in scratch:** O2 (separate directories mode 700, key files 600, five distinct credentials, no key or token visible in the provider's environment). **Not verifiable in scratch:** all scratch processes run as one operating-system user, so OS-level separation, host separation, hardware key custody and who can reach the sink storage are infrastructure-design decisions. **Boundary stated plainly:** a PostgreSQL superuser, and any person holding two of the three custodies, can still defeat these controls; separation of custody is the control.

## 17. Two-person authorisation (decision 3)

**Built (scratch).** `operators.mjs` and `recovery2.mjs`: a recovery request is prepared and signed by one authorised person; a second authorised person approves it, signing the exact request hash. The list of people and roles is signed by a separate security owner whose public key the orchestrator pins. Accepted only if: roles are right (preparer role / approver role), the two are different people with different keys, signatures verify, the approval covers this exact request and backup file hash, it is fresh (scratch: 15 minutes) and not expired, and it is used once. The approved backup and target are the only ones the orchestrator will use. Both identities, timestamps and the reason are written to the registry, the audit sink and the restored database's generation log (I3).

| ID | What is checked | Result | Evidence |
|---|---|---|---|
| P1 | Two-person authorisation: only a request prepared by one authorised person and approved by a DIFFERENT authorised person (each with the right role, each signing with their own key, the approval bound to the exact request and backup, still fresh, used once, from a list signed by the security owner) is accepted | **PASS** | valid: alice prepares, bob approves: as expected (ACCEPTED); valid: carol (both roles) prepares, bob approves: as expected (ACCEPTED); the same person prepares and approves: as expected (the approver is the same person as the preparer); a preparer-only person tries to approve: as expected ('bob' does not hold the preparer role); an approver-only person tries to prepare: as expected ('bob' does not hold the preparer role); a person who is not on the signed list approves: as expected (approver 'mallory' is not an authorised person); a person who is not on the list prepares: as expected (preparer 'mallory' is not an authorised person); request signed with someone else's key (mallory's key cl... |
| P2 | The orchestrator has no single-person path: without a request, with an unapproved request, with a self-approved request or with an unknown request it refuses before touching the registry, any database or any product | **PASS** | no request: identity database recovery needs a two-person authorised request; unapproved: authorisation refused: no approval; self-approved: authorisation refused: the approver is the same person as the preparer; unknown: authorisation refused: no such request; registry file byte-identical: true |

**Restricted emergency procedure (documented, NOT built, no permanent bypass).** If the normal two people cannot be assembled: (1) the emergency is declared by the incident lead and recorded; (2) the same two-person rule still applies, but from a separately held emergency pool of authorised people (sealed, split custody, at least two custodians required to open it); (3) the emergency credentials are single-use, expire within hours, and are re-sealed afterwards; (4) every step is written to the independent sink; (5) a post-incident review within 24 hours confirms the actions. There is no standing single-person credential and no configuration flag that skips the second approver.

## 18. What a recovery request protects (summary)

An aborted recovery (a required product cannot confirm its hold) still consumes the request, so a new request is needed; this is deliberate, to keep each approval single-use.

## 19. Membership changes after the backup (decision 4, the critical condition)

**Finding.** Restoring the identity database alone would silently bring back every membership as it was at backup time: removed people regain access, ownership transfers are undone, accepted invitations vanish. That cannot be repaired from inside the restored database.

**Design built in scratch.**
1. **Independent access journal** (`access-journal.mjs`): a separate process with its own storage and two tokens (append, read), hash-chained, no edit or delete. It is not in the identity database, so a restore cannot roll it back. Production needs an independently owned, replicated, immutable store; the scratch process proves the protocol only.
2. **Journal first** (`access.mjs`): every security-relevant change (member add/remove, role change, ownership transfer, invitation create/accept/revoke) first writes an **intent** to the journal. If the journal cannot be written the change is **refused** (fail closed). The database change, the per-business sequence, the platform event and a **state digest** are committed in one transaction; then a **commit marker** carrying the digest is written to the journal.
3. **Recovery** (`replay.mjs`): after the restore, **every business starts blocked**. A business is released only if: the restored state matches the journal's committed digest for the restored sequence (detects a corrupt or altered backup); every later change is present, contiguous and committed; each replays to exactly the digest the journal recorded; and no product has witnessed a change beyond what the journal holds. Anything else stays blocked with the reason.
4. **Products** report the highest journal sequence they have witnessed per business (from membership events). The platform's membership answers **exclude blocked businesses**, products refuse a session working in a blocked business (403), and an acknowledgement is valid only if the product reconciled against the **same blocked set** the platform holds.
5. **Releasing a blocked business:** automatic re-verification when the journal is reachable again; otherwise only a **two-person attestation** (two different authorised people signing the same statement), which is written to the journal. Nothing is released on one person's say-so.
6. **Incomplete history never trusted:** a tampered journal chain, an unreachable journal, a missing commit marker, a gap, an altered backup, or a product witness beyond the journal each leave the affected business (or all businesses) blocked.

**Results.** Isolated replay engine (`r11a`):

| ID | What is checked | Result | Evidence |
|---|---|---|---|
| M1 | Post-backup changes survive the restore: member additions and removals, role changes, ownership transfer, invitation create/accept/revoke are replayed from the independent journal, and each business's state equals the live state exactly | **PASS** | 9 of 9 post-backup changes replayed; restored state differed from live before replay: true; digests equal after replay: X true, Y true, V true; old owner is now 'admin', removed member present: 0, invitations accepted/revoked; verified 68 businesses |
| M2 | An intent with no commit marker is never trusted: crash after the journal write (nothing in the database) and crash after the database commit (marker missing) both leave that business BLOCKED with the reason; other businesses are unaffected | **PASS** | Z (crashed after intent): change 1 (member.add) has no commit marker: it may or may not have taken effect; W (database committed, marker lost): change 1 (member.add) has no commit marker: it may or may not have taken effect; blocked businesses in total: 4 of which verified-ok: 68 |
| M4 | A journal whose chain does not verify (one stored record edited) is not trusted: every business stays blocked | **PASS** | journal verify: {"ok":false,"at":62,"why":"content does not match its hash"}; blocked 72; verified 0; reason: journal cannot be trusted (content does not match its hash) |
| M5 | A journal that cannot be reached leaves every business blocked (it is never assumed that nothing changed) | **PASS** | blocked 72; reason: journal cannot be trusted (journal unreachable: fetch failed) |
| M6 | A restored database whose state does not match the journal's digest at the restored sequence (backup altered or corrupt) is blocked for that business only | **PASS** | X: restored state does not match the journal at sequence 3 (backup corrupt or altered); Y and V verified: true |
| M7 | If a product witnessed a change beyond what the journal holds (journal incomplete), that business stays blocked even though everything else verifies | **PASS** | V: a product witnessed change 99, beyond the journal's committed 1; X and Y still verified: true |

Full recovery, integrated (`r11c`):

| ID | What is checked | Result | Evidence |
|---|---|---|---|
| I1 | Post-backup membership changes (removal, addition, role change, ownership transfer, invitation create and accept) survive a full recovery: the restored access state equals the live state before the disaster, and the removed member does NOT get the old membership back | **PASS** | steps 1,2,3,3b,4,6,7; digests equal to live: A true, B true; removed user's memberships now ["orgA-i1o036"] (business B absent: true); new owner owner, previous owner admin; invited user in A: true; replay access state: 59 business(es) verified by replay (6 change(s) replayed), 2 blocked |
| I2 | Only the businesses whose history genuinely cannot be proven stay blocked (the two left unresolved by the earlier crash tests); everything else is released; every product acknowledged against that same blocked set | **PASS** | blocked: {"orgW-mvz5dk2x":"the journal has no committed digest for restored sequence 1","orgZ-mvz5dk2x":"change 1 (member.add) has no commit marker: it may or may not have taken effect"}; unexpected blocked: 0; both products acknowledged this recovery: true |
| I3 | Both identities, the timestamps and the reason of the two-person authorisation are recorded in the registry, the independent audit sink and the restored database | **PASS** | registry: alice/bob at 2026-11-02T11:08:21.749Z and 2026-11-02T11:08:21.751Z, reason "drill I1: lost the identity database"; sink record present: true; restored database generation_log: alice/bob |
| I4 | A session working in a blocked business is refused by the product (403 with the reason), not merely absent from a list | **PASS** | product answered 403 (access to orgW-mvz5dk2x is blocked until its membership history is verified) |
| I5 | A product that witnessed a change beyond what the journal holds proves the journal incomplete: that business stays blocked (and its members do not see it), while the recovery itself completes for everything else | **PASS** | reason: a product witnessed change 8, beyond the journal's committed 1; the user's visible memberships: ["orgB-i5o036"] |
| I6 | A business whose history cannot be recovered is released only by two different authorised people attesting the same statement; one person, the same person twice, or no attestation releases nothing, and the release is recorded in the journal | **PASS** | one: needs two different authorised people (valid attestations from: alice); same person twice: needs two different authorised people (valid attestations from: alice); still blocked after those: true; two people: released by alice,bob; blocked afterwards: false; journal attestation: [{"by":"alice+bob","note":"checked with the business owner by phone","at":"2026-11-02T11:08:29.629Z","upTo":null}] |
| I7 | With the journal unreachable the recovery still completes and authentication works, but EVERY business is blocked (nothing is assumed unchanged) and no membership is visible | **PASS** | blocked 65 of 65 businesses; the user's visible memberships: []; reason: journal cannot be trusted (journal unreachable: fetch failed) |
| I7b | When the journal is back, re-verification releases exactly the businesses it can prove (membership visible again) and keeps the unprovable ones blocked | **PASS** | re-verified 63; still blocked 2 (orgW-mvz5dk2x, orgZ-mvz5dk2x); user's memberships again ["orgA-i7o036","orgB-i7o036"] |
| I8 | A required product that cannot confirm its recovery hold stops the recovery before anything changes: nothing started, holds on the other products released, registry and generation untouched, no database created | **PASS** | recovery not started: 1 required product(s) did not confirm the recovery hold (nothing was changed; holds were released); registry normal gen 25 (was 25); app1 session validation {"ok":true}; target database created: false |
| I9 | During a recovery the 24-hour continuation does NOT apply: with the provider down after the hold was confirmed, the product answers 'hold: platform unreachable' (closed) while in an ordinary outage (I8a) the same product continued | **PASS** | ordinary outage: {"ok":true,"outage":true}; during recovery with the provider down: app1 {"ok":false,"reason":"recovery rec_43c8e627ca hold: platform unreachable"}, app2 {"ok":"down"} |
| I9b | The recovery cannot resume while a required product is unreachable (it is not skipped); when it returns, the same authorised request resumes and finishes | **PASS** | result: not every required product acknowledged; normal traffic stays closed; app2: unreachable (ECONNREFUSED); registry recovering |
| I9c | Resume with the same request finishes: both products acknowledged and normal traffic is back | **PASS** | ok=true; acked ["lyqrFZruKXBBrOYGVSjFersUInEzoVTe","uEzyRVRMUfSUNSxLDmtORQMmkirTZpVC"]; registry normal |

**Defect found and fixed:** the first integrated run failed I4 (a blocked business was not refused at the product) because the scratch product read the business from a Better Auth session field that does not exist there; it now reads the database column. First attempt kept in `r11c-first-attempt.out`.

**Outstanding membership-recovery work (not done):**
- The journal is a local process. Production needs an independent, replicated, immutable store, an owner other than the database operators, and an availability design (the change path is intentionally unavailable if the journal is down: administrative access changes stop).
- Cross-system atomicity is handled by intent plus marker, so a crash between the database commit and the marker leaves that business blocked until verified (false positive, safe). Whether operations can live with that rate was not measured.
- The scratch covers members, roles, ownership, invitations. Other security-relevant organisation changes (business suspension or deletion, billing-owner change, SSO or domain-claim changes, API-key or integration grants, permission-policy changes, product-held roles in Caterly) are **not yet journaled**; each needs the same intent/marker/digest treatment, or an explicit decision that it lives in a product.
- Product-specific roles live in the product databases and are restored with those, not with the identity database. A product restore needs its own plan (not designed here).
- The journal is the single authority on completeness. Journal loss is detected only if a product witnessed a later change, or the chain breaks; loss of the tail with no witness would be invisible. A second independent witness (for example periodic signed digests held by the audit sink and by products) is recommended and not built.
- Scale and performance of replay (51 businesses here), parallel changes to one business, and invitation-token handling (tokens are hashed in the digest) were not tested at production volume.

## 20. Product behaviour during recovery (decision 5)

**The distinction, in one table.**

| Situation | Product behaviour |
|---|---|
| Ordinary IdP outage (no recovery under way, no hold) | Existing sessions continue, bounded by the approved 24 hours since the last verified generation. New sign-ins are blocked by the provider being down. |
| Identity database recovery | The 24-hour continuation does **not** apply. A recovery starts only after **every required product has confirmed a durable recovery hold**; if one cannot confirm, nothing starts, holds on the others are released, and the registry and generation stay untouched (I8). With a confirmed hold, a product is closed whether the provider is up (in recovery mode) or down (I9). It acknowledges only after reconciling and verifying four things itself plus the blocked set, and normal traffic resumes only after all required products acknowledge (I9b, I9c). |

**Changes made for this:** the orchestrator now requires hold **confirmation** (not just a push) before generation advance, and releases holds if any is missing. A product that goes down after confirming still blocks the resume; the same authorised request resumes it.

**Limitation:** a product that is reachable by users but unreachable by the orchestrator cannot be held, so the recovery refuses to start (this makes recovery depend on every required product being reachable at the start). Decision for AJ: accept that, or define a safe path for taking a partitioned product out of service first.

## 21. Regression of the earlier suites

After the monitor (v2 with outbox), provider (v7) and product (v8) changed, the previously accepted suites were rerun: guard enforcement `r10a` **11 of 11**, hybrid recovery `r10b` **18 of 18**. Earlier result files are kept with `.before-r11` and `.first-run` suffixes.

## 22. Remaining limitations (consolidated)

- Superuser, table-owner and operator access remain an infrastructure trust boundary. Separation of custody is the control, and scratch cannot prove OS-level separation.
- All sessions in these tests are cookie jars over HTTP; **real-browser, multi-device testing is still required later.** Real Nginx, Cloudflare, firewall, hosted or replicated PostgreSQL, the real retry schedule, production scale and clock skew across hosts were not tested.
- Production thresholds for the audit outbox are undecided (section 15).
- Not yet journaled: organisation changes beyond members, roles, ownership and invitations (section 19).
- The journal, sink and registry are local scratch stand-ins for independently owned stores.
- No Platform or Ops application code was changed; nothing here is production implementation.
- Existing Caterly sessions: forced reauthentication, no automatic mapping by email or user id, no migration authorised.
- Dev server loop: cause unknown; both tests pass; do not investigate unless it returns (then capture connected browser and IDE-preview clients first).

## 23. Decisions still open for AJ

1. Production thresholds for the audit outbox (queue capacity, oldest-event, outage duration, administrative limit) and the outbox disk design.
2. Named owners and hosts for: monitor key, baseline file, audit sink, access journal, operator list (security owner).
3. Which other organisation changes must be journaled in M1 (suspension or deletion, billing owner, SSO or domain claims, integrations), and the product-database restore plan.
4. Whether a second witness of journal completeness (signed periodic digests) is required.
5. How to handle a partitioned required product at recovery start.
6. Real-browser validation scope and timing.
7. E1 (Logto access), F2.1.4, D1, M1 and the provider decision: all still open and not started.

## 24. Scratch artifacts added this session

New in `idp-spike/`: `access-journal.mjs`, `access.mjs`, `replay.mjs`, `verify-access.mjs`, `operators.mjs`, `recovery2.mjs`, `guard-monitor2.mjs`, `op7.mjs`, `rp8.mjs`, `setup-access.sql`, tests `r11a-replay.mjs`, `r11b-outbox.mjs`, `r11c-recovery.mjs`, `r11d-twoperson.mjs`, results `r11a` to `r11d`. Outside it: `access-journal/`, `baseline-owner/`, `security-owner/`, `operator-keys/` (scratch keys for alice, bob, carol, mallory), `control/` (operator list and signature, public keys, signed baseline, request files, backups). Scratch databases `spike_rpl*`, `spike_mem*`, `spike_rec*` (many). At the stop, the registry is at generation 30, mode normal, live scratch database `spike_rec8_mvz5qq1n`. All scratch servers are stopped; the main dev server (3000), Site (3100), Ops (3200) and Platform (3300) are running and untouched.
