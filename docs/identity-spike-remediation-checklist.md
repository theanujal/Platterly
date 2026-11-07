# Identity spike: remediation and verification checklist (2026-11-01)

Follows `docs/identity-spike-results.md`, which is unchanged. This is a **plan for review**. Nothing here has been implemented, no provider has been chosen, F2.1.4 has not started (it needs E1), Caterly, Ops and the main authentication are untouched, the scratch project and scratch databases are kept, and nothing is committed.

Scratch project: `/private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/cb904566-5b08-45a0-9688-17538e210dc7/scratchpad/idp-spike`. Scratch databases: `spike_idp`, `spike_rp1`, `spike_rp2`. All tests below run there first, on scratch code, until you approve otherwise.

## Summary of the six items
| # | Item | Spike result it answers | Release blocker? | Needs a decision from AJ |
|---|---|---|---|---|
| 1 | Client creation security | K4 (and the default-open behaviour seen before it) | **Yes** | No |
| 2 | Rate limiting behind the proxy | S4 | **Yes**, proven at staging | No |
| 3 | Back-channel logout and the cached session | Y4 | **Yes**, unless you accept a documented delay | **Yes**: pick the fix (A to D) |
| 4 | Session revocation path | Y7, Y8 | **Yes** | No |
| 5 | Local HTTP redirect URIs | K3 | No (development only); the no-weakening rule is a test | No |
| 6 | Next.js and Caterly compatibility | Not claimed | **Yes** for D1 and for M1 | No |

---

## 1. Client creation security
| | |
|---|---|
| **Current behaviour** | Without `clientPrivileges`, the first spike run let any signed-in user create an OAuth client (201). With `clientPrivileges: ({ user }) => user.email.startsWith("admin")` in the spike, an ordinary user got 401 (K4). That rule was a stand-in: it keys on an email prefix, which is not a permission model. |
| **Required behaviour** | Only Platterly staff acting through a staff-only path can create, update, rotate or delete clients. No client creation by customers, by product owners or by unauthenticated callers. Dynamic registration stays closed. |
| **Proposed fix** | Set `clientPrivileges` explicitly in the provider config to allow only a staff user flag (for example a `role === "platform_staff"` column on the identity user that no sign-up path can set), and set `resourcePrivileges` the same way. Keep `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration` at false. Seed the first-party clients (Caterly, Account, Store, stub) from a reviewed script, not from the UI. Add an audit row for every client change (the provider has none, see G4). |
| **Exact test** | On scratch code, with the final privilege rule: (a) unauthenticated `POST /oauth2/create-client` returns 401; (b) a signed-in ordinary user: `create-client`, `update-client`, `delete-client`, `rotate-secret`, and the resource endpoints each return 401 or 403, and a count of rows in `oauthClient` is unchanged; (c) a staff user can do all of them; (d) `POST /oauth2/register` returns 403 with and without a session; (e) a user whose email starts with `admin` but who is not staff is refused (proves the stand-in rule is gone); (f) a user who is made staff by editing only their display name or email cannot create a client. |
| **Release blocker** | **Yes.** An open client registry lets anyone mint a client that the provider will trust with sign-in. |

## 2. Rate limiting behind the trusted proxy
| | |
|---|---|
| **Current behaviour** | The provider rate limits sign-in (4th attempt in 10 s gets 429) and the token endpoint (21st request). With no trusted proxy, a forged `X-Forwarded-For` gives each attempt a new bucket and dodges the limit (S4). The repo's `deploy/nginx/platterly.conf` already sets `X-Forwarded-For $remote_addr` (an overwrite, not an append) and uses `real_ip_header CF-Connecting-IP` for Cloudflare. Nothing has been run through a proxy in this spike. |
| **Required behaviour** | Behind the real proxy, the client address the limiter sees is the proxy-derived address; a client-supplied `X-Forwarded-For`, `X-Real-IP` or `CF-Connecting-IP` can never change the bucket. Direct access to the app port, bypassing the proxy, is impossible in staging and production. |
| **Proposed fix** | (1) In the provider config, set `advanced.ipAddress.ipAddressHeaders` to only the header the proxy sets (as Caterly does today in `src/lib/auth/auth.ts`), and `ipAddress.ipv6Subnet` if used. (2) Reuse the existing Nginx directives for the new `auth.` host: overwrite `X-Forwarded-For` with `$remote_addr`, take the real address from Cloudflare only for Cloudflare's ranges. (3) Bind the app to localhost so the proxy cannot be skipped. (4) Keep rate-limit storage in the database or Redis, not memory, if more than one process runs (blue/green). |
| **Exact test** | Local: nginx is not installed on this machine, so the local run uses a throwaway Node reverse proxy that applies the same two header rules; it proves the application setting, not Nginx. Staging (the real proof, needs a server): through Nginx, run the S1 to S5 sequence from one address, then repeat S4 with 8 different forged `X-Forwarded-For`, `X-Real-IP` and `CF-Connecting-IP` values. Pass means a 429 by attempt 4 in every case, the correct password is also refused while limited (S2), and the limit lifts after the window (S3). Also: a request straight to the app port from outside the machine fails to connect. Record the Nginx config used. |
| **Release blocker** | **Yes**, for staging to production. The local proxy emulation is not enough; the staging run is the gate. |

## 3. Back-channel logout and the product's cached session
| | |
|---|---|
| **Current behaviour** | After a valid back-channel logout the product deletes its database sessions, but the browser's signed `better-auth.session_data` cookie keeps answering until `cookieCache.maxAge` (Y4: about 7.6 s of an 8 s maxAge). A fresh check (`disableCookieCache`) refuses at once. Caterly itself does not enable the cookie cache today (no `cookieCache` setting in `src/lib/auth/auth.ts`), so today it has no such delay. |
| **Required behaviour** | After a valid back-channel logout, an affected user cannot use any product page or API on the next request, with the cache enabled. If a bounded delay is accepted, it is a written number, tested, and sensitive actions are exempt. |
| **What I found** | The server cannot clear a cookie it does not receive. Better Auth's `cookieCache.version` accepts a function (`(session, user) => string`, may be async), so a cached cookie is invalid as soon as the version it was signed with differs from the current one. A version derived from a per-user "sessions valid from" value makes every cached cookie for that user invalid after a logout, at the cost of one small indexed read per request instead of the full session read. The option and its type are in `@better-auth/core` `init-options` (checked in the installed 1.7.15 types); **I have not run it**. |
| **Options** | **A. Version function** keyed on a per-user revocation epoch written by the back-channel handler (and by the membership event handler). Immediate. One cheap lookup per request. **B. Short `maxAge`** (for example 30 s or less): no code, delay equals maxAge. **C. No cookie cache** (what Caterly does today): immediate, a database read per request. **D. `disableCookieCache` on sensitive routes only** (billing, team, ownership, security, deletes): keeps the cache for read-only pages, still allows the delay on them. These combine: A or C for the product-wide guarantee, D as the floor. **Recommendation:** C for Caterly at first (it already works that way), A if a measured need appears; B only with your written acceptance of the number. |
| **Exact test** | On scratch relying parties with the cache enabled and `maxAge` of 8 s: sign in at two products, prime the cache at product 2, trigger logout at product 1, then within 1 s call product 2 with the cached cookie. Pass means product 2 answers signed-out (option A) at 0.8 s and at 7 s; for option B, the answer is signed-out no later than maxAge + 1 s and a sensitive route is signed-out at once. Also test: (a) a forged logout token still changes nothing (Z1 repeated); (b) a logout for user X does not invalidate user Y's cache; (c) the new request cost, measured over 200 requests, against the no-version baseline; (d) a user who signs in again after logout gets a working cache (the epoch is not permanently poisoning the user). |
| **Release blocker** | **Yes**, unless you accept a stated delay. This needs your choice among A to D. |

## 4. Session revocation: Platform Core must use the OP's revoke path
| | |
|---|---|
| **Current behaviour** | Plain sign-out, end-session and `revoke-sessions` notify the products by back-channel logout (Y6, Y8). Deleting OP session rows directly, or letting a database cascade delete them, notifies nobody (Y7). |
| **Required behaviour** | Every way a person loses access (sign out, "sign out everywhere", password change or reset, email change, account disable, membership removal, ownership transfer, business suspend or delete, staff action) goes through one function that revokes at the OP and so triggers back-channel logout. No other code writes or deletes `session` rows. |
| **Flows found by reading the current code (read-only search of `src`, `apps/ops/src`, `scripts`, `e2e`)** | (1) `src/modules/team/team.ts:81` deletes a removed member's Caterly sessions with `prisma.session.deleteMany`. Today that is Caterly's own session table, so it is correct; once login is central, a removed member's OP session and other products' sessions are unaffected by it. It must become a `membership.changed` event plus a revoke call. (2) The `session.userId` relation is `onDelete: Cascade` in `prisma/schema.prisma`, so deleting a user row silently deletes their sessions. Any future "delete account" or import clean-up that deletes users would bypass the revoke path. (3) `e2e/db.ts` and the Ops `scripts/create-staff.mjs` touch session or user rows directly; the e2e helper is test-only, the Ops script is Ops's own database and separate from the OP. (4) The platform's own scripts and any manual SQL during migration or support. I did not find a flow in current code that writes to a future OP database, because none exists yet. |
| **Proposed fix** | Make the rule a written standard: "Only `revokeUserSessions(userId, reason)` in Platform Core may end an OP session." That function calls the provider's revoke endpoint (or the same internal logic) so back-channel logout fires, writes an audit row, and returns the count. Enforce it three ways: (1) the OP database role used by the app has no `DELETE` on `session` except through a database function or a dedicated role used only by that code path (decide at design); (2) a test that greps the Platform source for direct `session` deletes and fails the build; (3) change the foreign key to `ON DELETE RESTRICT` for `session.userId` so deleting a user without revoking first fails loudly, and delete users only through one service function that revokes first. Also add a reconciliation job: sessions at the OP that no longer match an active user or membership are revoked through the same function. |
| **Exact test** | (a) Each trigger in the Required list, run against scratch code, produces a back-channel call to every product the user has a session with (count the calls) and an audit row. (b) Attempting `DELETE FROM session` as the application role fails. (c) Deleting a user row with live sessions fails (`RESTRICT`) and succeeds after `revokeUserSessions`. (d) The source-scan test fails when a deliberate `prisma.session.delete` is added. (e) The reconciliation job revokes an orphaned session and notifies the product. (f) After a revoke, product sessions are gone within the bound chosen in item 3. |
| **Release blocker** | **Yes.** Without it, account disable and compromise handling would silently skip products. |

## 5. Local HTTP redirect URIs
| | |
|---|---|
| **Current behaviour** | The provider rejects `http` redirect URIs for web clients, including `localhost` and `*.localhost`, with "web clients require https redirect URIs on non-loopback hosts" (K3). In the spike, local clients were created through the API with `https` URIs and the `oauthClient` row was then edited to `http` URIs. Redirect matching stays exact (A5: 10 near-miss variants refused). |
| **Required behaviour** | Redirect URI validation is not weakened anywhere. Local development works without changing provider code or options. |
| **Documented workaround** | Local only, by a seed script that is not part of any deployed path: create the client through the API with the `https` URI, then set `redirectUris`, `postLogoutRedirectUris` and `backchannelLogoutUri` to the local `http://*.localhost:<port>` values in the `oauthClient` row. The local seed file is the single place these URIs live. The alternative is local HTTPS for `*.localhost`, which would remove the workaround; it was not tested. Do **not** use `validateRedirectUri` to loosen matching, and do not set `allowDynamicClientRegistration`. |
| **Exact test** | (a) With the production configuration, creating a client with an `http://app.example.test` or `http://app1.localhost` URI through the API fails (K3 repeated, expected result: refused). (b) The production config does not contain `validateRedirectUri`. (c) A source scan fails if the local seed script is imported by anything outside the development tooling. (d) On the seeded local client, the 10 near-miss redirect variants are still refused and the exact URI is accepted (A5 and A5b repeated). (e) The seed script refuses to run when `NODE_ENV=production` or when the database name is not a local one. |
| **Release blocker** | **No.** It affects development only. The no-weakening rule and the seed-script guard (test e) are checked before the first deployment. |

## 6. Next.js compatibility (not claimed)
| | |
|---|---|
| **Current status** | The spike used a plain Node HTTP server and Better Auth's Node handler (`toNodeHandler`) for both the provider and the relying parties. **Next.js compatibility is not claimed. Caterly compatibility on better-auth 1.7.15 is not claimed.** Known Next.js-specific questions: serving discovery at the issuer root (`/.well-known/openid-configuration`) needs its own route, the catch-all auth route handler, how redirects, cookies and request headers behave in route handlers, `proxy.ts` host routing, and whether the provider's `sec-fetch-mode` logic (JSON versus 302) behaves the same through Next.js. |
| **Required behaviour** | The chosen provider runs inside `apps/platform` (Next.js 16.4.3) with the same results as the spike, and Caterly works on the version that the provider needs. |
| **Proposed fix and test (scratch first, separate approval)** | (a) A scratch Next.js 16.4.3 app, outside the repository, with `/api/auth/[...all]`, a root `/.well-known/openid-configuration` route, login and consent placeholder pages, and `auth.localhost` host handling. Re-run the F2.1.1 and F2.1.3 scripts unchanged; every result must match, and the redirect behaviour (302 versus JSON) must be checked with real browser-style headers. (b) Peer-version check: install `better-auth@1.7.15` and `@better-auth/oauth-provider@1.7.15` in a scratch **copy** of Caterly (not the repository) and run its Vitest suite and one named Playwright spec (surgical, per the testing rules). (c) Record which Caterly auth behaviours change (organisation plugin, emailOTP, hooks, cookie names). (d) Until both pass, every document that mentions the provider says "Node handler only". |
| **Release blocker** | **Yes**, for the D1 decision and for M1. |

---

## Updated PASS / FAIL / NOT TESTED summary
The original spike results are unchanged. This table adds the state after this checklist: nothing has been remediated, so no FAIL has become a PASS, and the checks that matter are listed as not yet tested.

| Area | Original result | State now | What changes it |
|---|---|---|---|
| Discovery, JWKS, key rotation, PKCE, redirect matching, state, nonce, refresh, revocation, custom claims, `prompt=none`, `max_age`, RP-initiated and back-channel logout, skip-consent, static registry | PASS (39 of 40 in F2.1.1) | PASS, unchanged | Re-run unchanged on the Next.js scratch app (item 6) |
| Local `http` redirect URIs through the API (K3) | FAIL | **FAIL**, documented workaround, not a blocker | Item 5 tests (a) to (e) |
| Client creation locked to staff (K4) | PASS with a stand-in rule | **PASS for the stand-in only; the real privilege rule is NOT TESTED** | Item 1 tests (a) to (f) |
| Sign-in and token rate limiting (S1, S2, S3, S5) | PASS | PASS, unchanged | Item 2 repeat through a proxy |
| Forged `X-Forwarded-For` (S4) | FAIL | **FAIL**; behind the proxy: **NOT TESTED** | Item 2 local emulation, then the staging run |
| Back-channel logout with cached session (Y4) | FAIL | **FAIL**; each fix option: **NOT TESTED** | Item 3 test, after you choose A to D |
| Direct deletion of OP sessions (Y7) | FAIL | **FAIL**; enforcement of the revoke-path rule: **NOT TESTED** | Item 4 tests (a) to (f) |
| Revoke-all and sign-out notify products (Y6, Y8) | PASS | PASS, unchanged | Item 4 test (a) repeated on the final code |
| Password hashes unchanged, `sub` equals the existing id (F2.1.2) | PASS (8 of 9) | PASS, unchanged | none |
| Two-host SSO, cookies, token validation matrix, expiry (F2.1.3 except Y4, Y7) | PASS (20 of 22) | PASS, unchanged | Item 6 re-run |
| Logto password import (I4); Logto comparison and every Logto gap item (G2, G3, G6) | NOT TESTED | **NOT TESTED** | E1, then F2.1.4 |
| Provider has no hosted login UI, audit trail or admin console (G1, G4, G5) | FAIL (not provided) | **FAIL (not provided)**, cost to be priced in F2.1.4 | F2.1.4 |
| Next.js 16 compatibility of the provider | NOT TESTED | **NOT TESTED**, not claimed | Item 6 (a) |
| Caterly on better-auth 1.7.15 | NOT TESTED | **NOT TESTED**, not claimed | Item 6 (b) |

## What I need from you
1. Review and approve, change or reject the six items, and tell me which of them I may start on scratch code.
2. Choose the item 3 fix (A to D), or ask me to run A and B in the scratch project first so you can choose on measured results.
3. E1 (the Logto dev tenant) whenever you want F2.1.4 to start.
