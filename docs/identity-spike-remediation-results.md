# Identity spike: remediation results, scratch only (2026-11-01)

Follows `docs/identity-spike-remediation-checklist.md`. The original `docs/identity-spike-results.md` is unchanged. Everything here ran in scratch projects, scratch databases or a scratch copy of Caterly. Caterly, Ops and the Platform application were not modified (verified: the repository still resolves `better-auth` 1.7.4 and nothing under `src` changed), no production configuration was touched, nothing was committed, F2.1.4 was not started and no provider has been chosen.

Scratch locations, all under `/private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/cb904566-5b08-45a0-9688-17538e210dc7/scratchpad/`: `idp-spike/` (provider `op2.mjs`, relying party `rp2.mjs`, `proxy.mjs`, `setup-hard.sql`, `seed-local.mjs`, the `r1` to `r5` tests), `next-op/` (Next.js 16.4.3 provider), `caterly-copy/` (Caterly copy on better-auth 1.7.15; its `backups` and `migration-data` folders, every `.env` and every real credential were left out). Scratch databases: `spike_idp`, `spike_hard`, `spike_next`, `spike_caterly`, `spike_rp1`, `spike_rp2`. None deleted. All scratch servers are stopped.

## Status summary
| # | Item | Result | Blocker now? |
|---|---|---|---|
| 1 | Client creation: staff-only privileges | **PASS** on scratch; resource endpoints over HTTP **NOT TESTED** (not exposed) | Closed on scratch; production staff provisioning needs your decision |
| 2 | Rate limiting behind the proxy | **PASS** locally with a header-overwrite proxy; real Nginx **NOT TESTED** | Staging gate stays |
| 3 | Session cache | **Measured; nothing chosen** | Needs your decision |
| 4 | Session revocation enforcement | **PASS** with one limitation (superuser) and one new finding (endpoint context) | Closed on scratch; design needs your approval |
| 5 | Local HTTP redirect URIs | **PASS** | Not a blocker |
| 6 | Next.js 16 and Caterly on 1.7.15 | **PASS** for what was run; production build and 70 other specs **NOT TESTED** | Partly closed |

Counts: item 1 7 PASS; item 2 7 PASS, 1 FAIL; item 4 17 PASS, 1 FAIL; item 5 6 PASS. Next.js provider parity with the Node results: 40 of 40 F2.1.1 results and 22 of 22 F2.1.3 results are identical.

---

## 1. Client creation security
**Implementation.** `op2.mjs`: a `staff` boolean on the user (`input: false`, so no API can set it; only a database update does), and `clientPrivileges` and `resourcePrivileges` both `user.staff === true`. Dynamic registration left closed. No email-prefix rule anywhere.

| ID | Test | Result | Evidence |
|---|---|---|---|
| C1a | Unauthenticated client management is refused | **PASS** | oauth2/create-client:401, oauth2/update-client:401, oauth2/delete-client:401, client/rotate-secret:401, oauth2/create-client:404, oauth2/update-client:404; oauthClient rows unchanged (1) |
| C1b | Ordinary user: create, update, delete, rotate-secret and the resource/admin endpoints are all refused; no row or name changed | **PASS** | create:401, update:401, delete:401, rotate-secret:401, admin-create:404, admin-update:404, resources-create:404; rows 1->1; target client row (name, secret hash, redirect URIs, disabled) byte-identical: true |
| C1c | A user whose email starts with 'admin' but is not staff is refused (the stand-in rule is gone) | **PASS** | create:401, update:401, delete:401, rotate-secret:401, admin-create:404, admin-update:404, resources-create:404 |
| C1d | Staff user can create, update, rotate and delete clients | **PASS** | create:201 update:200 rotate:200 delete:200; staff resource create:404 (endpoint not exposed over HTTP or not allowed) |
| C1e | Dynamic registration is closed for anonymous, ordinary and staff callers alike | **PASS** | anonymous:403 ordinary:403 staff:403 |
| C1f | Staff cannot be self-granted: not through sign-up, update-user or an email change | **PASS** | sign-up with staff:true -> status 200, staff=false; update-user with staff:true -> 400, staff=false; change-email -> 400; client create by that user -> 401 |
| C1g | Removing the staff flag takes effect on the next request | **PASS** | former staff user create-client -> 401 (session cookie cache is off in the provider) |

**Remaining limitations.** The `/admin/oauth2/*` endpoints (including resources) answer 404 over HTTP, so `resourcePrivileges` is configured but could not be exercised from outside (NOT TESTED). Staff are provisioned here by a database update; a production staff-management tool, who may grant staff, and an audit row for each change are undesigned. The provider writes no audit record of client changes.
**Decision needed from you.** How staff are provisioned and audited in production (a staff table in Platform Core is my suggestion).

## 2. Rate limiting behind the proxy
**Implementation.** `proxy.mjs` copies the header rules of `deploy/nginx/platterly.conf` (`X-Forwarded-For` and `X-Real-IP` overwritten with the connecting address, every other header forwarded as is). The provider reads only `x-forwarded-for` (`advanced.ipAddress.ipAddressHeaders`) and listens on 127.0.0.1 only; the proxy listens on all interfaces.

| ID | Test | Result | Evidence |
|---|---|---|---|
| RL1 | Through the proxy: sign-in is limited (429 from the 4th attempt) | **PASS** | 401,401,401,429,429,429,429,429,429,429 |
| RL2 | Through the proxy: forged X-Forwarded-For, X-Real-IP and CF-Connecting-IP (12 different values) cannot bypass the limit | **PASS** | 401,401,401,429,429,429,429,429,429,429,429,429 |
| RL3 | Through the proxy: a forged multi-address X-Forwarded-For chain is overwritten, not appended (same bucket) | **PASS** | 401,401,401,429,429,429,429,429 |
| RL4 | While limited, the correct password is also refused | **PASS** | correct password during the window -> 429 |
| RL5 | The limit lifts after the window (the real owner is not locked out for good) | **PASS** | correct password 11 s later -> 200 |
| RL6 | Through the proxy: the token endpoint is limited even with forged headers | **PASS** | 40 requests, each with a different forged X-Forwarded-For -> first 429 at 21 |
| RL7 | Bypassing the proxy (calling the app port directly with forged headers) dodges the limit: this is why the app port must be unreachable | **FAIL** | direct to 127.0.0.1:4313 with 8 forged addresses -> 401,401,401,401,401,401,401,401 (limit bypassed: true) |
| RL8 | The app port is bound to loopback only; the proxy port is reachable from the LAN address | **PASS** | from LAN address 192.168.0.104: app port 4313 -> ECONNREFUSED; proxy port 4413 -> connected; loopback app port -> connected. Local only: production still needs the server firewall verified at staging |

**Remaining limitations.** This proves the application setting against a Node stand-in, not Nginx. Not tested: the real Nginx file, Cloudflare ranges and `real_ip_header`, IPv6 address grouping, rate-limit storage shared between blue/green processes (the default storage is memory and resets on restart), the server firewall. RL7 is expected to show the bypass: calling the app port directly dodges the limit, which is why the app port must stay unreachable (RL8).
**Decision needed.** None now. The staging run with the real Nginx stays a gate.

## 3. Session cache: comparative measurements
**Implementation.** `rp2.mjs` (a product using Better Auth sessions) runs in four modes: no cookie cache; plain cache (the control, as in the original spike); short `maxAge` (5 s); and `cookieCache.version` as an async function reading a per-user revocation counter (`user_epoch`), which the back-channel logout handler increments when it deletes the user's sessions. Per mode: 200 sequential and 300 parallel (20 at a time) session checks for a signed-in user; three logouts (RP-initiated, with back-channel logout to the other product), polling the other product every 20 ms with its cached cookie until it answers signed-out; a bystander user signed in throughout; and a re-login after logout.

| Approach | Logout propagation to the product (3 runs, ms) | Session check p50 / p95 (ms) | DB queries per check | Throughput (req/s, 20 parallel) | Bystander user unaffected | Re-login after logout works |
|---|---|---|---|---|---|---|
| No cookie cache | 2, 1, 1 | 0.67 / 0.94 | 2 (parallel run: 2) | 4220 | yes | yes |
| Plain cache, maxAge 30 s (control = spike behaviour) | 30079, 29923, 30001 | 0.26 / 0.43 | 0 (parallel run: 0) | 7623 | yes | yes |
| Short cookieCache.maxAge 5 s | 4979, 4988, 4990 | 0.24 / 0.40 | 0 (parallel run: 0) | 7806 | yes | yes |
| cookieCache.version + per-user revocation counter (maxAge 30 s) | 2, 2, 1 | 0.36 / 0.56 | 1 (parallel run: 1) | 5224 | yes | yes |

Reading the table: everything ran on one machine over loopback with a tiny database, so only the ratios mean anything. Database queries per check are counted in the product process. A propagation of 1 to 2 ms means the very next request was already refused.
- **No cache:** immediate; 2 queries per check (session and user); about 0.4 ms slower at the median than a cached check here.
- **Version function:** immediate; 1 query per check (the counter), half the no-cache cost, while the cache still saves the session and user reads. Needs the product to maintain the counter in its back-channel handler.
- **Short maxAge (5 s):** the delay equals maxAge (about 5 s), no queries. The plain 30 s cache is the original behaviour (about 30 s).
- In all four, the bystander stays signed in, and re-login works with the cache behaving normally afterwards (the counter does not poison a user permanently).

**Remaining limitations.** If a back-channel call is lost, none of the approaches helps: the product session survives until the membership-version pull (item 4). The version function reads the counter on every check, so what happens when the counter store is down depends on code not written here. The numbers are local; production latency, connection pooling and database load were not measured.
**Decision needed from you.** Choose the approach. My reading of the evidence: your preference (no cookie cache for Caterly) is supported. It gives immediate propagation with no new code, and costs one extra query per request. The version function is the upgrade path if request cost ever becomes a measured problem. A short maxAge is the only option that leaves a stated delay.

## 4. Session revocation: one controlled service
**Design implemented in scratch** (`op2.mjs`, `setup-hard.sql`, `core/`, `scan.mjs`):
1. **Two database roles.** `op_runtime` (Better Auth and the revocation service) may delete `session` rows. `platform_core` (business code) has no privilege at all on `session`, `account` or the token tables.
2. **Trigger** `BEFORE DELETE` (and `BEFORE TRUNCATE`) on `session`: refuses everyone except `op_runtime`, the table owner and superusers included.
3. **Foreign key** `session.userId` is `ON DELETE RESTRICT` (it was `CASCADE`), so a user cannot be deleted while sessions exist.
4. **One service**, `revokeUserSessions`, which writes an audit row; plus `deleteUserAccount` (revoke, then delete in one core transaction, retried up to 3 times), `disableUser`, `reconcileSessions`, and `removeMembership` (writes a `membership.changed` event and does not touch OP sessions).
5. **Source scan** of business code, as one layer only.

**New finding.** The provider sends back-channel logout from a session-delete hook that returns early when there is no Better Auth endpoint context. Calling `internalAdapter.deleteSessions` from plain library code deleted the rows and notified nobody (the first run: 0 back-channel calls). The service is therefore a **SERVER_ONLY endpoint** of a small plugin, called through `auth.api`; it answers 404 over HTTP (verified), and with it every test below delivers its back-channel calls.

| ID | Test | Result | Evidence |
|---|---|---|---|
| RV1 | Platform Core's database role cannot delete, update, insert or even read session rows (the exact shape of the Caterly team.ts:81 delete is refused) | **PASS** | delete: 42501 permission denied for table session; delete (filtered): 42501 permission denied for table sessio; update: 42501 permission denied for table sessio; select: 42501 permission denied for table sessio; sessions still there: 1 |
| RV2 | Even the table owner and a database superuser are stopped by the trigger (row delete and TRUNCATE) | **PASS** | owner delete: 42501 session rows may only be deleted by the OP runtime through the revocation service (c; owner truncate cascade: 42501 session may not be truncated (current_user=spike_app); plain truncate: 0A000 cannot truncate a table referenced in a foreign key co; superuser delete: 42501 session |
| RV2b | LIMITATION: a database superuser can switch triggers off (session_replication_role=replica) | **FAIL** | superuser with session_replication_role=replica: statement accepted (trigger skipped), rows=0. Needs superuser; runtime roles are not superusers. Mitigation: no application path holds superuser, production superuser use is break-glass and audited |
| RV3 | Provider sign-out (running as op_runtime) is not blocked by the trigger and still sends back-channel logout | **PASS** | OP sessions after end-session: 0; app2 back-channel logouts +1 |
| RV4 | Expired-session cleanup by Better Auth (a delete done by the provider itself) works under the trigger | **PASS** | get-session on an expired session -> null; row removed: true |
| RV5 | revokeUserSessions ends every OP session, sends back-channel logout to every product, and writes an audit row | **PASS** | revoked 1; OP sessions now 0; app1 +1, app2 +1; product fresh /me: null, null; audit {"reason":"test_revoke","sessionCount":1,"actor":"tester"} |
| RV6 | Deleting a user row while sessions exist is refused by the foreign key (ON DELETE RESTRICT), for the core role and the owner | **PASS** | core role: 23503 update or delete on table "user" violates foreign key constraint "member_userId_fkey" on table "member"; owner: 23503 update or delete on table "user" violates foreign key constraint "member_userId_fkey" on table "member"; user still exists: true |
| RV6b | The session foreign key alone (no memberships involved) also refuses user deletion while sessions exist | **PASS** | core: 23503 update or delete on table "user" violates foreign key constraint "session_userId_fkey" on table "session"; owner: 23503 update or delete on table "user" violates foreign key constraint "session_userId_fkey" on table "session" |
| RV6c | After the service has revoked, the same direct delete succeeds (the foreign key only forces the order) | **PASS** | delete after revoke: ok |
| RV7 | deleteUserAccount: revokes first (products are told), then deletes memberships and the user; account and token rows go with it | **PASS** | before: account=1 refresh=2 access=2; after: {"u":"0","acc":"0","rt":"0","at":"0","m":"0"}; app1 +1, app2 +1; {"revoked":1,"attempts":1}; product fresh /me: null |
| RV8 | Race: a session created between revoke and delete makes the delete roll back, then the service revokes again and succeeds (no partial deletion) | **PASS** | sessions present at the moment of the first delete: 1; attempts needed: 2; user gone: true |
| RV9 | If sessions keep appearing, deletion fails cleanly after 3 attempts and memberships are untouched (transaction rolled back) | **PASS** | error=23503; memberships kept: 1 |
| RV10 | Member removal writes a membership.changed event, removes only that membership and leaves the person's sign-in alone (they may belong to other businesses) | **PASS** | event={"type":"membership.changed","data":{"status":"removed","userId":"kg4RpjEVB2uvyhLPPlNyLN8gKeY9NU3o"}}; memberships left=org_y; OP sessions 1 -> 1; product session still valid: true |
| RV11 | A developer who copies the old 'delete the removed member's sessions' line into Platform Core gets a permission error, not a silent success | **PASS** | 42501 permission denied for table session |
| RV12 | Account disable: the decision is recorded by Platform Core and sessions are revoked through the service; products are told | **PASS** | revoked 1; app2 +1; product session: null |
| RV13 | Reconciliation revokes a live session of a disabled user through the same service | **PASS** | slipped sessions=1; reconcile {"users":1,"sessions":1}; now 0. NOTE: nothing here stops a disabled user from signing in again; Platform Core must also refuse the sign-in (separate item) |
| RV14 | Source scan: business code (core/) has no session access, and the scan catches a deliberate violation (one layer only; RV1 to RV2 are the enforcement) | **PASS** | core/: 0 hits; planted prisma.session.deleteMany: 1 hit(s) |
| RV15 | Only the revocation service in the OP module calls the session-deleting adapter method | **PASS** | occurrences in op2.mjs: 1 |

**Remaining limitations.**
- A database superuser can disable triggers (RV2b). Runtime roles are not superusers; superuser use must be break-glass and audited.
- The database cannot tell the revocation service from Better Auth's own code, because both run as `op_runtime`. A bug in OP-module code could still delete sessions without a hook. Mitigations: code review, the source scan, and one module owning `op_runtime`. A finer separation (a second role or row-level security) was not tested.
- Not tested: deleting a whole business (there is no organisation table in scratch); product-side clean-up when a membership event arrives (needs a product consumer); stopping a disabled user from signing in again (see the RV13 note); hosted databases where the role split may differ.
- `member` was set to RESTRICT here, while `account`, `oauthConsent`, `oauthRefreshToken` and `oauthAccessToken` still cascade, which RV7 shows is acceptable once sessions are revoked first.
**Decision needed.** Approve the layered design as the standard, and say whether the revocation service gets its own database role apart from Better Auth's.

## 5. Local HTTP redirect URIs
**Implementation.** `seed-local.mjs` (guard plus seeder, imported only by the setup script). It creates the client through the API with https URIs, then writes the local http URIs. The guard refuses unless `NODE_ENV` is not production, `ALLOW_LOCAL_CLIENT_SEED=1` is set, the database host is local, the database name looks like a development database, and every URI is http or https on `localhost`, `127.0.0.1` or `*.localhost` with no credentials or fragment. The provider's redirect validation is untouched.

| ID | Test | Result | Evidence |
|---|---|---|---|
| LC1 | With the production configuration, even a staff user cannot register an http redirect URI through the API (local, loopback or public host) | **PASS** | http://app9.localhost:4309/cb:400; http://localhost:3000/cb:400; http://127.0.0.1:3000/cb:400; http://app.example.test/cb:400 |
| LC2 | The provider configuration contains no validateRedirectUri and does not open dynamic registration | **PASS** | settings found in op2.mjs: [] |
| LC3 | The seed guard refuses production, a missing flag, remote or production-named databases and every non-local or tricky URI, and accepts the local development cases | **PASS** | NODE_ENV=production: refused; flag not set: refused; remote database host: refused; production-looking database name: refused; bare database name 'platterly': refused; public redirect host: refused; look-alike host localhost.evil.com: refused; userinfo trick: refused; fragment: refused; non-http sch |
| LC4 | Running the real seed script without the flag, or with NODE_ENV=production, exits with an error before creating anything | **PASS** | no flag: exit 1, if (env.ALLOW_LOCAL_CLIENT_SEED !== "1") throw new SeedRefused("ALLOW_LOCAL_CLIENT_SEED=1 is required (set only by the development script)");; production: exit 1, if (env.NODE_ENV === "production") throw new SeedRefused("NODE_ENV is production"); |
| LC5 | Only the development setup script and this test import the seeder; the provider, relying parties and proxy do not | **PASS** | importers: r5-local.mjs, setup-hard-clients.mjs |
| LC6 | On the database-seeded client, 12 near-miss redirect URIs are refused (no code issued) and the exact URI is accepted | **PASS** | 12 of 12 refused; exact accepted: true |

**Remaining limitations.** The guard is a seatbelt, not a security boundary: a development database named `platterly_dev` is accepted by design. The real protection is that the script is not shipped, the production provider configuration, and the production credentials. Local HTTPS instead (which would remove the workaround) was not tested.
**Decision needed.** None. Where the script lives (development tooling only, excluded from the deploy artefact) should be fixed when the platform repository work resumes.

## 6. Compatibility
**Next.js 16.4.3 provider** (`next-op/`): Better Auth 1.7.15 and the OAuth provider 1.7.15 behind `app/api/auth/[...all]/route.ts` (`toNextJsHandler`) and `app/.well-known/openid-configuration/route.ts` (`oauthProviderOpenIdConfigMetadata`), login and consent placeholder pages, the same hardened configuration, run with `next dev` (Turbopack). The F2.1.1 matrix and the F2.1.3 suite were run unchanged except for the staff flag and the database name.
- F2.1.1 matrix: **40 of 40** results identical to the Node-handler results (39 PASS and K3 FAIL, as before).
- F2.1.3 suite: **22 of 22** identical (20 PASS, and Y4 and Y7 FAIL, as before).
- Discovery at the root route works; the SERVER_ONLY revocation endpoint answers 404 through the Next route; the 302 versus JSON redirect behaviour is the same.
- The relying parties in that run were still Node handlers.

**Caterly copy on better-auth 1.7.15** (`caterly-copy/`, scratch database, no real credentials; ZeptoMail and Razorpay unset):
| Check | Result |
|---|---|
| `npm install better-auth@1.7.15` (no other change) | PASS, no peer warnings |
| Type check (`npm run typecheck`) | **PASS** |
| ESLint on `src` | **PASS** (0 errors, 1 existing warning) |
| Vitest, full suite | **1774 passed, 1 failed, 1 skipped.** The failure (`library/photos.test.ts`) expects `http://catering.localhost:3000` and the copy runs on 3010; it fails identically on better-auth 1.7.4 in the same copy, so it is environmental and not caused by the bump |
| Playwright `e2e/kitchenlogin.spec.ts` (sign-up, email code, onboarding, sign-out, sign-in, wrong password, terms) against the copy's dev server on port 3010 | **PASS, 5 of 5** |

**Not tested:** `next build` and `next start` of the Next.js provider; `proxy.ts` host routing in front of it; real-browser (Playwright) provider flows; relying parties on Next.js; the other 70 Playwright specs on 1.7.15 (for example `team-management` and `password-reset`); Ops on 1.7.15; the real development data on 1.7.15; sending real email; cookie behaviour on production HTTPS. **Next.js and Caterly compatibility are supported by the runs above, not proven for production.** The existing Caterly and Ops applications were not upgraded.
**Decision needed.** Whether to run more Caterly specs on the copy (I suggest `team-management` and `password-reset` next, one at a time) and a production build of the Next.js provider before D1.

---

## Updated PASS / FAIL / NOT TESTED
| Area | Before this round | Now |
|---|---|---|
| Staff-only client and resource privileges | K4 PASS with a stand-in rule | **PASS** with a real staff flag; resource endpoints over HTTP **NOT TESTED** (not exposed) |
| Proxy rate limiting, forged headers | S4 FAIL; behind proxy NOT TESTED | **PASS** locally behind the emulated proxy; app port loopback-only **PASS**; direct bypass **FAIL** by design (RL7); real Nginx **NOT TESTED** |
| Back-channel logout vs cached session (Y4) | FAIL | Still **FAIL** with a plain or short cache (about 30 s and 5 s); **PASS** (immediate) with no cache and with the version function; choice pending |
| Direct deletion of OP sessions (Y7) | FAIL | Direct SQL by any role now blocked (**PASS**); superuser bypass **FAIL** by design; revocation outside an endpoint context silently skips back-channel logout (new finding, handled by the service) |
| Local http redirect URIs (K3) | FAIL | Still **FAIL** through the API (by design); guarded workaround **PASS**; exact matching unchanged **PASS** |
| Next.js provider | NOT TESTED | **PASS** in dev (62 of 62 results identical to the Node handler); build and host routing **NOT TESTED** |
| Caterly on 1.7.15 | NOT TESTED | **PASS** on typecheck, lint, 1774 of 1775 Vitest (1 environmental, same on 1.7.4) and 1 Playwright spec; the rest **NOT TESTED** |
| Logto items, F2.1.4, I4, G2, G3, G6 | NOT TESTED | **NOT TESTED** (needs E1) |

## Decisions still required from you
1. Item 1: how staff are provisioned and audited in production.
2. Item 3: choose the session-cache approach (my reading favours no cookie cache for Caterly).
3. Item 4: approve the layered revocation design, and whether the revocation service gets its own database role.
4. Item 6: which further Caterly specs to run, and whether to test a Next.js production build before D1.
5. E1, whenever you want F2.1.4 to start.
