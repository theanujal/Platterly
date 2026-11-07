# Identity spike: follow-up report, scratch only (2026-11-02)

Follows `docs/identity-spike-results.md`, `docs/identity-spike-remediation-checklist.md` and `docs/identity-spike-remediation-results.md`, which are unchanged. Everything here ran in scratch projects, scratch databases or a scratch copy of Caterly. Caterly, Ops and the Platform application were not modified; the repository still resolves `better-auth` 1.7.4; no staging or production work; no provider has been chosen; F2.1.4 and any Logto tenant were not touched; nothing was committed; no scratch database or project was deleted.

Scratch locations, all under `/private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/cb904566-5b08-45a0-9688-17538e210dc7/scratchpad/`: `idp-spike/` (provider `op3.mjs`, product `rp4.mjs`, `dispatcher.mjs`, `setup-dur.sql`, tests `r7*` and `r8*`), `next-op/` (Next.js 16.4.3 provider, built for production), `caterly-copy/` (Caterly on better-auth 1.7.15). Scratch databases: `spike_idp`, `spike_hard`, `spike_next`, `spike_nextprod`, `spike_dur`, `spike_caterly`, `spike_rp1`, `spike_rp2`.

## Status summary
| # | Your decision | Result | Still open |
|---|---|---|---|
| 1 | Central, explicitly provisioned staff role | Process documented (section 1); the scratch flag stays as proof of concept | Production tool and approval of the process |
| 2 | No cookie cache; version function documented only; lost back-channel recovery documented and tested | **PASS** (section 2): 23 of 23 PASS in the durable-delivery suite | Real schedule and worker not run; per-session mapping not built |
| 3 | Layered revocation design with the changes you listed | **PASS** with two stated limitations (section 3): 7 of 8 PASS (PM2 FAIL by design: documented limitation) in the mechanism suite | Production role layout and the superuser rule |
| 4.1 | Caterly team-management specs on 1.7.15 | **PASS**: `team-management` 1 of 1, plus `role-permissions` 5 of 5 and `roles-sensitive-access` 3 of 3 | The remaining specs |
| 4.2 | Caterly password-reset specs on 1.7.15 | **PASS**: 2 of 2 | none |
| 4.3 | Next.js 16 production build and production-mode integration | **PASS**: 10 of 10 PASS | Browser-driven flows and real Nginx |
| 5 | Logto | **NOT TESTED**, not started (needs E1) | E1 |

A defect that my own first run exposed is described in section 3 (duplicate events under concurrent revokes); it is fixed in the scratch design and covered by a test.

---

## 1. Staff provisioning (documented process; the scratch flag is only a proof of concept)
The proof of concept (`user.staff`, writable by no API) already shows that email prefixes, email domains and public sign-up grant nothing (earlier tests C1c and C1f, repeated in `docs/identity-spike-remediation-results.md`). The production process below is a design for your approval; it is **not implemented and not tested** beyond that.

**Principles.** Staff status is a role, held in a Platform Core table, changed only through one controlled function that writes its own audit row in the same transaction. No rule based on an email address, an email domain, a sign-up path, a header or a client-supplied field can grant it.

| Topic | Rule |
|---|---|
| Where it lives | `platform_staff(user_id, role, granted_by, approved_by, granted_at, reason, expires_at, revoked_at, revoked_by)`. Roles are few and named (for example `staff_admin`, `staff_engineer`, `staff_support`); the OP reads the role from this table, never from a user-editable field. |
| Who can grant | Only a `staff_admin`, through the function `grant_staff()`. Granting `staff_admin` needs a second, different `staff_admin` to approve. The target must be an existing user with a verified email; MFA must be on once MFA exists. Nobody can grant themselves. |
| Initial bootstrap | One-time, on the server: an install script creates a single-use bootstrap token, shown once and stored only as a hash. It works only while `platform_staff` is empty, creates the first `staff_admin` for the person named at install (AJ), is logged, and is destroyed after use. After that the script refuses to run. Recovery after losing every admin is a separate, documented, two-person procedure with server access. |
| Removal | `revoke_staff()` sets `revoked_at`, writes the audit row, calls the revocation service for that person's sessions, and rotates any credentials they could see. It takes effect on the next request (tested in the proof of concept: the former staff user was refused immediately). The last active `staff_admin` cannot be removed. |
| Expiry | Every grant has an `expires_at` (default 90 days). An expired grant stops working by itself; renewal is an explicit, audited action. |
| Audit trail | Append-only `staff_audit`: who, whom, action, reason, time, address. No update or delete privilege for any application role. A weekly digest of grants, removals and staff actions goes to the owner; a grant or removal also raises an alert at once. Client-registry and privilege changes are staff actions and are audited the same way. |
| Periodic review | Quarterly: the owner receives the list of active staff with role, granted by, last activity and expiry, and confirms or removes each one in writing. Dormant accounts (no staff action in 60 days) are flagged for removal. |
| Tests required before this is built | Grant needs a staff admin; a second approver is enforced for admins; self-grant fails; an email prefix or domain, a look-alike name, a changed display name or email grants nothing; removal ends access on the next request and ends sessions; expiry works; the last admin cannot be removed; the bootstrap token works once only and never when staff exist; every path writes exactly one audit row; the audit table cannot be edited by the application roles. |

## 2. Session cache and lost back-channel logout
**Decision recorded.** No cookie cache initially. Check NC1 shows the product issues only `better-auth.session_token`, so a deleted session is refused on the very next request. The `cookieCache.version` approach is documented as a future optimisation and is **not implemented**: it gave immediate propagation with one query per check (measured earlier) and can be revisited if request cost becomes a measured problem. No cookie cache does not remove the risk of a lost revocation call (DL2 shows the product session surviving a lost back-channel call), so recovery is built in layers:

| Layer | What it does | Property tested |
|---|---|---|
| 1. Provider back-channel logout | Immediate signed call from the provider when a session is deleted | Fast; **not durable**: when it fails the provider logs a warning and no retry was observed in this run |
| 2. Durable event (outbox) | Every session deletion writes one `session.revoked` event per product in the same transaction; a dispatcher delivers it with retries | Durable (DL2, UD2), retryable on the schedule (DL2), idempotent by event id (ID1), ordered by a per-scope sequence (ID2), safe under worker crash (CR1) and parallel workers (CC1), parked after the window and replayable (DD1), signed and refused when forged (EV1) |
| 3. Recovery pull | The product compares the platform's per-user revocation epoch with the last one it applied and ends its sessions if it is behind | Works when both layers 1 and 2 failed (RC1); forged request refused (RC2); a healthy user is untouched (RC1) |
| 4. Monitoring | Pending count, oldest undelivered age, max attempts, parked count, expired worker leases, with alert rules | Warning on lag, critical on parked events, warning on a stuck worker (DL3, DD1, CR1) |

**Schedule used.** The plan's schedule (1 min, 5 min, 30 min, 2 h, 12 h, 24 h, parked after 7 days) was run at a reduced scale (300, 600, 1200 ms and a 6 s window) so the logic could be tested; the real constants are in `dispatcher.mjs` (`REAL_BACKOFF_MS`, `REAL_DEAD_AFTER_MS`) and were **not run at real time**. Recommended alert thresholds: warn when the oldest undelivered event is older than 5 minutes; critical on any parked event; warn when a lease has been expired for more than 5 minutes; page on a product with more than 3 consecutive failures.

**Findings from this work.**
- The provider's back-channel call is user-wide in these scratch products. A real product should end only the session that matches the OP session id (`sid`), which means storing `sid` at login; the events already carry the OP `sessionId`. **Not built, NOT TESTED.**
- The epoch is per user, so a lost event for any one session makes the recovery pull end all of that user's product sessions. Safe, but heavier than needed.
- Sequence numbers must never go backwards: after the OP database was rebuilt in this scratch run, the products still held the old sequence numbers and silently ignored the new events as stale (seen in the first run of the membership test). Restoring the platform database from a backup could do the same in production. Needs a design (a generation number in the sequence, or never restoring counters) before go-live.
- Product secrets are stored in plain text in the scratch table; production would encrypt them as Ops does.
- Each deleted session writes one event per product. A "sign out everywhere" with many sessions creates many events; batching is possible.

## 3. Session revocation: the approved design, built and tested in scratch
**What was built** (`setup-dur.sql`, `op3.mjs`, `dispatcher.mjs`, `rp4.mjs`):
1. **The session table is closed.** The real table is `session_data`, owned by `op_revoker`, a role nobody can sign in as. Better Auth keeps using the name `session`, which is now a **view** with an `INSTEAD OF DELETE` trigger. Every deletion, including Better Auth's own sign-out, revoke-all, revoke-others, password-change and expiry clean-up, therefore runs through one `SECURITY DEFINER` function that deletes the row, increments the user's revocation epoch, writes the outbox events and an audit row, all in one transaction.
2. **Separate roles.** `op_runtime` (Better Auth) can use the view but not the base table, cannot write the outbox or edit deliveries. `op_dispatcher` (delivery worker) sees events and secrets and can update only the status columns of deliveries; it cannot see sessions or users. `platform_core` (business code) has no access to sessions or credentials and can only emit events through a function. The revocation endpoint is called through one service, and its database authority is the definer function owned by `op_revoker`.
3. **Foreign keys** `session` → `user` and `member` → `user` are `ON DELETE RESTRICT`, so a user cannot be deleted while sessions or memberships exist.
4. **The endpoint authenticates its caller.** The server-only endpoint requires a signed request from a named internal caller (per-caller secret, 60 s window, nonce stored in the database against replay, allowed reasons per caller). It does not rely on the 404 for authorisation.
5. **Member removal** emits a `membership.changed` event and removes only the membership; it does not touch the person's OP sessions. The product ends only the sessions working inside that business.
6. **User deletion** revokes first, then deletes memberships and the user in one transaction; a session created in between rolls the transaction back, and the service revokes again (up to 3 attempts).

**Correction of the earlier trigger claim.** Earlier text said the trigger "stops a superuser too". That is wrong. A PostgreSQL superuser, or the owner of the table, can disable triggers (`ALTER TABLE ... DISABLE TRIGGER`) or run with `session_replication_role = replica`, and then delete session rows with no event and no audit row; PM2 shows this. The trigger and the privileges protect against mistakes and against non-privileged code, not against a superuser. The remaining controls are procedural: no application holds superuser, superuser use is break-glass and logged, and a break-glass deletion must be followed by a service revoke because the recovery pull cannot see it.

**Defect found by my first run and fixed.** With 8 simultaneous revocations of a user with 5 sessions, the first version of the trigger wrote 40 events: a row already deleted by a parallel transaction still produced an event. The trigger now returns early when its delete removed nothing; RB4 passes (exactly 5 events, gap-free sequence).

### Mechanism suite (permissions, Better Auth flows, endpoint authentication)
| ID | Test | Result | Evidence |
|---|---|---|---|
| PM1 | Permission matrix: business code cannot touch sessions, credentials or the outbox; the OP runtime cannot touch the base table, forge events or edit deliveries; the dispatcher sees neither sessions nor users and can only update status columns; the owner and a superuser cannot delete base rows directly | **PASS** | platform_core: select session (view): as intended; platform_core: select session_data: as intended; platform_core: delete session: as intended; platform_core: delete session_data: as intended; platform_core: insert platform_outbox (forge an event): as intended; platform_core: update platform_deliver |
| PM2 | LIMITATION (corrected claim): a superuser or the table owner CAN disable the guard and delete base rows with no event and no audit row | **FAIL** | superuser ALTER TABLE ... DISABLE TRIGGER then delete removed 1 row(s); session_replication_role=replica removed 1 row(s); outbox rows written for either: 0. Triggers are a guard against mistakes and non-privileged code, not against a superuser. Controls that remain: nobody holds superuser in the ap |
| BA1 | Every Better Auth session deletion (sign-out, revoke all, revoke others, password change, expiry cleanup) and the service go through the same mechanism: each deleted session produces exactly one durable event, one audit row and one epoch step | **PASS** | sign-out: ok (sessions 1 -> 0, events +1, audit +1, epoch +1); revoke-sessions (all): ok (sessions 3 -> 0, events +3, audit +3, epoch +3); revoke-other-sessions: ok (sessions 2 -> 1, events +1, audit +1, epoch +1); change-password with revokeOtherSessions (200; it ends the old sessions and starts a  |
| BA2 | Sign-in (insert) and session refresh (update) work through the view; the session row is created and refreshed in the base table | **PASS** | get-session returned the user; expiry pushed forward by 48 h (7-day window renewed); rows in base table 2 |
| EA1 | The revocation endpoint authenticates its internal caller itself: missing, unknown, forged, tampered, stale, future-dated and wrong-reason requests are all refused and no session is touched | **PASS** | no credential fields: refused; unknown caller: refused; wrong secret: refused; tampered user id after signing: refused; tampered reason after signing: refused; stale timestamp (61 s old): refused; future timestamp (+61 s): refused; reconcile-job asking for a reason it may not give: refused; platform |
| EA2 | A valid request works once; the same signed request replayed is refused (nonce stored in the database); another allowed caller works | **PASS** | first: ok; replay: refused; reconcile-job with its own reason: ok; nonce rows: 3 |
| EA3 | Each accepted request is recorded with its caller and reason | **PASS** | [{"caller":"platform-core","reason":"test_revoke","session_count":1},{"caller":"reconcile-job","reason":"reconciliation","session_count":0}] |
| EA4 | Over HTTP: the normal build answers 404 even with a valid signature; if the endpoint were exposed by mistake, it still refuses unauthenticated and forged calls (401) and only a valid signature works | **PASS** | normal build: 404; exposed instance: no credential 400, forged 401, sessions intact 1, valid 200 |


### Durable delivery, recovery, scoped removal, deletion, rollback, concurrency
| ID | Test | Result | Evidence |
|---|---|---|---|
| DL0 | Starting state: every earlier delivery is drained | **PASS** | drained in 196 ms |
| EV1 | The product's event endpoint refuses unsigned, wrong-secret, stale, wrong-route, tampered and wrong-client requests, and applies none of them | **PASS** | no signature:401, wrong secret:401, stale (400 s):401, signed for another route:401, tampered body:401, another product's client id:401; applied unchanged: true |
| DL1 | Normal path: the provider's back-channel logout ends both product sessions at once, and the durable events are then delivered once each and applied or recognised | **PASS** | product sessions after revoke: null/null; events received app1 +1, app2 +1; applied +1/+1; provider back-channel calls app1 +1; delivered rows +2; drained in 14 ms |
| DL2 | Lost back-channel logout + product outage: the product session survives (the risk), the event stays pending and is retried on the schedule 300, 600, 1200 ms (stands for 1 min, 5 min, 30 min) | **PASS** | session still signed in after revoke: true; attempt 1 failed (HTTP 500), retry in 300 ms; attempt 2 failed (HTTP 500), retry in 600 ms; attempt 3 failed (HTTP 500), retry in 1200 ms; attempt 4 failed (HTTP 500), retry in 1200 ms; delivery row: {"attempts":4,"last_error":"HTTP 500","status":"pending" |
| DL3 | Monitoring: while the delivery is stuck the monitor reports pending count, oldest age, max attempts and raises a delivery_lag warning | **PASS** | {"pending":1,"in_flight":0,"dead":0,"delivered":27,"oldest_undelivered_ms":4073.362,"oldest_expired_lease_ms":0,"max_attempts":4,"alerts":[{"level":"warning","rule":"delivery_lag","detail":"oldest undelivered event is 4073 ms old"}]} |
| DL4 | Recovery: when the product is back, the next retry delivers the event, the product session ends, and the alerts clear | **PASS** | session ended 10 ms after the product recovered (next retry due within 1200 ms); monitor after: {"pending":0,"in_flight":0,"dead":0,"delivered":28,"oldest_undelivered_ms":0,"oldest_expired_lease_ms":0,"max_attempts":0,"alerts":[]} |
| ID1 | Idempotency: delivering the same event again changes nothing (duplicate recognised); the person's new session is not killed by an old event | **PASS** | duplicates +1, applied +0; new session still signed in: true |
| ID2 | Ordering: a different event with a lower sequence number is ignored as stale; a higher one is applied | **PASS** | lower sequence -> {"applied":false,"reason":"stale sequence"}, session alive true; higher sequence -> {"applied":true,"revoked":1}, session alive false |
| CR1 | Worker crash after the product applied the event but before the status was written: the delivery stays in_flight, is reclaimed after the lease, re-sent, recognised as a duplicate, and finally marked delivered | **PASS** | crashed ticks: [{"id":"31","crashed":true,"productStatus":200},{"id":"32","crashed":true,"productStatus":200}]; a second worker could not take it during the lease (0 claimed); stuck_in_flight alert after lease: true; final {"status":"delivered","attempts":2}; product duplicates +1, applied +1 |
| CC1 | Two workers draining 50 deliveries at once: each delivery is sent exactly once (row locks with SKIP LOCKED), no duplicates at the products | **PASS** | claimed 50, received at products 50, duplicates 0 |
| DD1 | Dead letter: after the delivery window the event is parked and a critical alert appears; the product session is still alive; staff replay delivers it and the session ends | **PASS** | parked after 7074 ms (window 6000 ms; real 7 days), attempts 8; alert: [{"level":"critical","rule":"dead_letters","detail":"1 delivery(ies) parked after the delivery window"}]; session alive while parked: true; after replay: null |
| RC1 | Recovery pull: with the back-channel call lost AND the event parked, the product's reconcile finds the platform's revocation epoch ahead of its own and ends the session; a second run does nothing; a healthy user is untouched | **PASS** | before: session alive true; reconcile #1 {"platformEpoch":1,"applied":0,"revoked":1} -> alive false; #2 {"platformEpoch":1,"applied":1,"revoked":0}; healthy user {"platformEpoch":0,"applied":0,"revoked":0} still signed in true |
| RC2 | The epoch endpoint refuses an unsigned or forged request | **PASS** | forged signature -> 401 |
| MR1 | Member removal revokes only the affected business at the product: the session working in business X ends, the one working in business Y and the person's other product keep working, and the OP sign-in is untouched | **PASS** | product sessions left: [{"id":"UPRWTb4uYkoWorAACdbNl6eKCdntfAna","org":"orgY-mvy6ab6g"}]; memberships left orgY-mvy6ab6g; OP sessions 1 -> 1; product 2 still signed in true; event {"type":"membership.changed","scope_kind":"business","scope_id":"orgX-mvy6ab6g","sequence":"1"} |
| MR2 | Replaying the membership event is harmless (duplicate), and the surviving orgY session is not touched | **PASS** | duplicates +1; sessions left 1 |
| UD1 | User deletion is blocked while sessions, memberships or a disabled-user record exist (foreign keys), for the business role and the owner | **PASS** | core: 23503 update or delete on table "user" violates foreign key constraint "session_userId_fkey" on table "session_data"; owner: 23503 update or delete on table "user" violates foreign key constraint "session_userId_fkey" on table "session_data" |
| UD2 | deleteUserAccount revokes first, then removes memberships and the user; the durable events outlive the user row and still end the product session after the product recovers | **PASS** | {"revoked":1,"attempts":1}; user gone true; undelivered events about the deleted user 2; product session alive while the product was down true; after recovery null |
| RB1 | Rollback: a deletion that is rolled back leaves the session, the outbox, the audit trail and the epoch exactly as they were | **PASS** | before {"s":2,"o":0,"a":0,"e":0}; after rollback {"s":2,"o":0,"a":0,"e":0} |
| RB2 | Failure inside the mechanism (injected error after part of the work): the whole deletion fails, no half-written event, audit row or epoch step | **PASS** | error: P0001 injected failure; counts after {"s":2,"o":0,"a":0} |
| RB3 | Service failure and recovery: with the delete privilege missing the service call fails, nothing is deleted or recorded as done; after the fault is fixed a retry succeeds | **PASS** | failed call: 42501 permission denied for view session; sessions intact during the fault: 2; completed-request rows during the fault: 0; retry revoked 2 |
| RB4 | Concurrency: 8 simultaneous revocations of a user with 5 sessions end each session exactly once, produce exactly 5 events with gap-free sequence numbers and no failures | **PASS** | sessions 5; sessions deleted twice (duplicate events for one session): 0; (the 'revoked' count each call reports is what it found, 40 summed, so events are the reliable count); events +5; epoch +5; sequences 1,2,3,4,5; failures 0 |
| RB5 | Race: a sign-in that lands between revoke and delete rolls the deletion back; the service revokes again and the deletion succeeds on the second attempt with nothing half-deleted | **PASS** | {"revoked":2,"attempts":2} |
| NC1 | Decision check: the product runs without a cookie cache (no session_data cookie), so a deleted session is refused on the very next request | **PASS** | product cookies: better-auth.session_token |


**Remaining limitations.** Superuser and table-owner bypass (PM2). The database cannot tell the revocation endpoint from Better Auth's own code: both run through the view as `op_runtime`; what the endpoint adds is caller authentication, a request record and the allowed-reason check, while the database guarantees that every route produces the same event and audit trail. Tested only on a single scratch PostgreSQL; hosted databases, pooling and replicas were not tried. The view must be recreated by any migration that adds a column to the session table, and Better Auth's own migrate command must not be used against it (Platform uses Prisma migrations). Organisation or business deletion was not modelled. Stopping a disabled user from signing in again is a separate control.

## 4. Compatibility
### 4.1 and 4.2 Caterly on better-auth 1.7.15 (scratch copy, scratch database, no real credentials)
| Spec | Result |
|---|---|
| `e2e/team-management.spec.ts` (invite a teammate, accept by sign-up, joins the same organisation, disabling locks them out) | **PASS** 1 of 1 |
| `e2e/role-permissions.spec.ts` | **PASS** 5 of 5 |
| `e2e/roles-sensitive-access.spec.ts` | **PASS** 3 of 3 |
| `e2e/password-reset.spec.ts` (code by email, new password, wrong code refused; edited unsubscribe link refused) | **PASS** 2 of 2 |
| Earlier: typecheck, ESLint, Vitest (1774 of 1775; the one failure is environmental and identical on 1.7.4), `kitchenlogin.spec.ts` 5 of 5 | **PASS** |

Run one spec at a time with `PW_BASE_URL` pointing at the copy's dev server. The other specs were not run (**NOT TESTED**). The installed Caterly and Ops were not upgraded.

### 4.3 Next.js 16.4.3 provider, production build, production mode, HTTPS
`next build` succeeded (routes: the discovery route, the auth catch-all, health, login and consent pages, and the proxy). It was started with `next start` under `NODE_ENV=production`, bound to loopback, behind a scratch TLS terminator that overwrites the forwarded address headers, with two Node products also behind TLS. Self-signed certificate; certificate checking was disabled in the scratch clients.

| ID | Test | Result | Evidence |
|---|---|---|---|
| NP1 | Host routing in production mode: identity endpoints only on auth.*, unknown and look-alike hosts get 404, health everywhere | **PASS** | auth host: discovery: 200; auth host: JWKS: 200; auth host: login page: 200; account host: discovery is not served: 404; store host: auth API is not served: 404; account host: login page is not served: 404; account host: home page is served: 200; bare localhost: nothing: 404; look-alike host: nothin |
| NP2 | Discovery: issuer and every endpoint are https on the auth host, PKCE S256 only, back-channel logout advertised | **PASS** | issuer=https://auth.localhost:4443; endpoints https=true; PKCE=S256; bcl=true |
| NP3 | JWKS served over https with a public key only (no private parameters) | **PASS** | 1 key(s): EdDSA/Ed25519 zimjCraqMtZ4TtgKsvkHGsBV6VGhwwJl; private member 'd' present: false |
| NP4 | Login in production mode: wrong password 401, right password 200, session cookie is Secure, HttpOnly, SameSite=Lax, host-only | **PASS** | cookie: __Secure-better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax; wrong=401 right=200 |
| NP5 | Authorization-code callback over https: both products sign the user in with no second prompt; the callback URL is the exact https URI; product session cookie is Secure | **PASS** | app1 {"user":"tZyk1P5U6q0PqK05PcgWHa5dY2ueon3L","email":"p179355750668344249@example.test"} app2 {"user":"c9dTMivy5D7sHbDydq4sLQ7bxacu15qR","email":"p179355750668344249@example.test"}; callback redirect=/me; iss in redirect=https://auth.localhost:4443 |
| NP6 | Token validation in production mode: valid ID token accepted; wrong issuer, audience, nonce, forged, unsigned and http-issuer tokens rejected | **PASS** | valid: true; wrong issuer expected: rejected (ERR_JWT_CLAIM_VALIDATION_FAILED); token confusion (aud of product 2): rejected (ERR_JWT_CLAIM_VALIDATION_FAILED); wrong nonce: rejected (nonce); attacker key, real kid: rejected (ERR_JWS_SIGNATURE_VERIFICATION_FAILED); unsigned: rejected (ERR_JOSE_ALG_NO |
| NP7 | RP-initiated logout over https ends the OP session, redirects to the exact post-logout URI and back-channel logout kills the other product's session | **PASS** | end-session -> 302 https://app1.localhost:4451/loggedout; OP session=null; app2 back-channel +1; app1/app2 fresh /me: null/null |
| NP8 | Forged back-channel logout tokens are refused over https | **PASS** | statuses: 400,400,400,400 |
| NP9 | Production hygiene: no stack traces in errors, no X-Powered-By, server-only revocation endpoint and admin endpoints unreachable | **PASS** | unknown API 404, bad JSON 400, unknown page 404; x-powered-by=null; server-only endpoint 404 |

| ID | Test | Result | Evidence |
|---|---|---|---|
| NP10 | Production mode has rate limiting on by default (no setting needed) and forged client-address headers through the TLS terminator do not dodge it | **PASS** | sign-up 200; 10 wrong passwords, each with different forged X-Forwarded-For/X-Real-IP -> 401,401,401,429,429,429,429,429,429,429 |

**Corrections made during this run.** The first production run failed two checks, both fixed in scratch and re-run: (a) host routing that preferred `X-Forwarded-Host` accepted a forged value, because the repository's Nginx sets `Host $host` but does not overwrite `X-Forwarded-Host` (NP1 initial); Platform host routing should read `Host` only; (b) the scratch config left `X-Powered-By` on (NP9 initial). The initial results are kept in `r7-initial-results.json` in the scratch folder.

**Separate finding for Caterly (no change made).** `src/lib/routing/hosts.ts` (`requestHost`) also prefers `X-Forwarded-Host`, and `deploy/nginx/platterly.conf` does not overwrite it, so a client-supplied value reaches the application. Practical impact looks small (cookies are host-only and the browser cannot forge the header cross-origin without a preflight), but Caterly should either read `Host` only or have Nginx set `X-Forwarded-Host $host`. Reporting only.

**Not tested in production mode.** Browser-driven (Playwright) provider flows; the real Nginx and Cloudflare; Next.js relying parties; `proxy.ts` behaviour behind the real host names; certificate validation; load.

### 4.4 Ops on 1.7.15
Not required. The only shared code between Ops and Caterly is `packages/contract`, which does not import Better Auth; Ops has its own Better Auth instance (`apps/ops/src/lib/auth.ts`) for staff sign-in and, per the plan, Ops staff login stays separate from the central identity. I found no concrete dependency that would force Ops onto 1.7.15, so I did not expand scope. If Ops staff are later moved behind the central identity, that would need its own test.

---

## Remaining gaps
1. The staff process (section 1) is a design only.
2. Per-session (`sid`) mapping at products, and the real-time schedule, are not built or run.
3. Sequence safety after restoring the platform database needs a design.
4. Superuser and table-owner bypass of the database guard is inherent; procedure only.
5. Real Nginx, Cloudflare and firewall behaviour (staging).
6. Remaining Caterly specs, Next.js browser flows, load.
7. All Logto items (E1).

## Decisions needed from you
1. Approve, change or reject the staff-provisioning process in section 1.
2. Confirm the layered revocation design as the standard, including the view-based approach that makes Better Auth's own deletions use the same mechanism, and the statement about superusers.
3. Decide how to handle the sequence-restore hazard (generation number versus a rule never to restore counters).
4. Decide whether per-session (`sid`) mapping at products is required for M1 or a later step.
5. Whether to widen the Caterly spec run on 1.7.15 beyond the team, role and password specs.
6. Whether Caterly's `X-Forwarded-Host` trust should be fixed (a separate change, not made here).
7. E1, when you want F2.1.4 to start.
