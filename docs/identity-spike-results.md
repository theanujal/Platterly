# Identity provider spike: results for F2.1.1 to F2.1.3 (2026-11-01)

Scope: Better Auth 1.7.15 with @better-auth/oauth-provider 1.7.15 (peer requirement met; jose 6.2.14), in a scratch project outside this repository. Local scratch databases only (spike_idp, spike_rp1, spike_rp2; the development data copy used for F2.1.2 was deleted after use). No production credentials or data. Caterly and Ops authentication were not modified. F2.1.4 (Logto Cloud) was not started because it needs E1, and no provider has been chosen.

Method: a provider (`op.mjs`) at auth.localhost:4300 and two relying parties (`rp.mjs`, Better Auth generic-oauth) at app1.localhost:4301 and app2.localhost:4302, driven by scripts that send browser-style HTTP requests with a host-scoped cookie jar. Raw HTTP was used because Node fetch adds `sec-fetch-mode: cors`, which makes the provider answer JSON instead of a 302. The scripts live in the scratch folder and are not part of the repository.

### F2.1.1 Provider checklist
| ID | Requirement | Result | Evidence |
|---|---|---|---|
| D1 | OIDC discovery document | **PASS** | served at /.well-known/openid-configuration; issuer=http://auth.localhost:4300; missing=[]; id_token_signing_alg=EdDSA; PKCE methods=S256; backchannel_logout_supported=true |
| D2 | JWKS endpoint publishes signing keys | **PASS** | 1 key(s): EdDSA/Ed25519 kid=NDaNBxoVIDEtJvOVofZv4qUw0jHm3iKf |
| A1 | Authorization code + PKCE (S256) -> tokens | **PASS** | token response keys=access_token,expires_in,expires_at,token_type,refresh_token,scope,id_token; authorize redirect had iss=http://auth.localhost:4300 |
| D3 | ID token verifies against JWKS (iss, aud, signature) | **PASS** | alg=EdDSA kid=NDaNBxoVIDEtJvOVofZv4qUw0jHm3iKf |
| A6 | state returned unchanged | **PASS** | sent=9NkL8WpE72X5hlL1 got=9NkL8WpE72X5hlL1 |
| A7 | nonce echoed in ID token | **PASS** | sent=A05WUOAIO6y9iiSK id_token.nonce=A05WUOAIO6y9iiSK |
| C1 | ID token custom claims (sub, email, email_verified, membership_version) | **PASS** | {"name":"Spike User","email":"user1793547054789@example.test","email_verified":false,"auth_time":1793547054,"acr":"0","membership_version":7,"at_hash":"QvKp9l0rstAuVCgwjQmvCXhun_AvEC2z28C19mhlyHo","iss":"http://auth.localhost:4300","sub":"4OD081rv8SleH5pDxwb6MJWRR9agFp6g","aud":"nsqlOuIiMtKGPsaUKLzERpcgoJzOYEIs","nonce":"A05WUOA |
| C2 | sub equals the user's stable id | **PASS** | sub=4OD081rv8SleH5pDxwb6MJWRR9agFp6g user.id=4OD081rv8SleH5pDxwb6MJWRR9agFp6g |
| C3 | userinfo endpoint returns the same sub and claims | **PASS** | {"sub":"4OD081rv8SleH5pDxwb6MJWRR9agFp6g","name":"Spike User","given_name":"Spike","family_name":"User","email":"user1793547054789@example.test","email_verified":false} |
| A2 | PKCE required: authorize without code_challenge is refused | **PASS** | status 302 location=http://app1.localhost:4301/callback?error=invalid_request&error_description=pkce+is+required+for+this+client&state=GQ7XcwcX2ytWBdgM&iss=http%3A%2F%2Fauth.localh |
| A3 | PKCE plain method refused | **PASS** | status 302 location=http://app1.localhost:4301/callback?error=invalid_request&error_description=code_challenge_method+must+be+one+of%3A+S256&state=QdadVwtYdUA3L8wa&iss=http%3A%2F%2 |
| A4 | Wrong code_verifier refused at the token endpoint | **PASS** | status 400 {"error_description":"code verification failed","error":"invalid_grant"} |
| A4b | A failed verifier attempt burns the code (correct verifier afterwards also refused) | **PASS** | retry with the right verifier -> status 400 |
| A8 | Authorization code is single use | **PASS** | first 200, replay 400 {"error_description":"invalid code","error":"invalid_grant"} |
| A8b | Replaying a used code revokes the tokens already issued from it (RFC 6749 4.1.2) | **PASS** | introspection of first access token after replay: {"active":false} |
| A9 | Wrong client secret refused | **PASS** | status 401 |
| A9b | Token request with a different redirect_uri refused | **PASS** | status 400 |
| A5 | Exact redirect URI match (10 near-miss variants all refused, no code sent) | **PASS** | other path:302; trailing slash:302; added query:302; other port:302; other host:302; prefix host:302; uppercase path:302; https scheme:302; fragment:302; userinfo:302 |
| A5b | Exact registered URI accepted | **PASS** | http://app1.localhost:4301/callback?code=EX9dfpGN1xUK3gJPdESrcdxRcWd2CKA3&state=g6DOhMC19lG1kLW8&iss |
| K1 | First-party client skips consent | **PASS** | client with skipConsent got a code with no consent step |
| K1b | Non-first-party client is sent to the consent page | **PASS** | /consent?response_type=code&redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Fcallback3&scope=openid+profile+email+offline_access&state=9oVf |
| K2 | Static client registry: dynamic client registration is closed by default | **PASS** | unauthenticated POST /oauth2/register -> 403 {"error":"access_denied","error_description":"Client registration is disabled"} |
| K3 | LIMITATION: registering an http://*.localhost redirect URI through the API | **FAIL** | API refuses non-https web redirect URIs ({"error":"invalid_redirect_uri","error_description":"web clients require https redirect URIs on non-loopback hosts: http). Workaround used: create with https, then set http URIs in the client table for local dev |
| K4 | Client registry is staff-only once clientPrivileges is set | **PASS** | ordinary user POST /oauth2/create-client -> 401; staff-style user created clients fine. Observed earlier without clientPrivileges: ANY signed-in user got 201, so production must set it |
| R1 | Refresh token grant issues new access + ID tokens | **PASS** | status 200; new refresh token differs: true |
| R2 | Refresh rotation: the old refresh token is refused once used | **PASS** | reuse -> 400 {"error_description":"invalid refresh token","error":"invalid_grant"} |
| R2b | Reuse of a rotated refresh token also kills the new one (theft detection) | **PASS** | new refresh token after reuse -> 400 |
| R3 | Refresh token revocation | **PASS** | revoke 200; refresh afterwards 400 |
| R3b | Revoking the refresh token also deactivates the access token issued with it | **PASS** | introspection of that access token: active=false |
| R4 | Access token introspection and revocation | **PASS** | before revoke active=true; revoke 200; after active=false |
| P1 | prompt=none without a session returns login_required to the client (no UI) | **PASS** | http://app1.localhost:4301/callback?error=login_required&error_description=authentication+required&state=rs1ca_R1q5vR4Oiq&iss=http%3A%2F%2Fauth.localhost%3A4300 |
| P2 | prompt=none with a live session returns a code silently | **PASS** | http://app1.localhost:4301/callback?code=HPM13bzdG62BsHcr2LtSgquaD893bWvx&state=G0kWHt_AHAISwt5Y&iss |
| P3 | No session: authorize redirects to the login page carrying the signed request | **PASS** | /login?response_type=code&redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Fcallback&scope=openid+profile+email+offline_access&state=b0jc-juuCxK8_lHb&client_id=nsqlOuIiMtKGPsaUKLzERpcgoJzOYEIs&code_ch |
| P4 | max_age=0 forces re-authentication | **PASS** | /login?response_type=code&redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Fcallback&scope=openid+profile+email+offline_ |
| P5 | max_age=2 after 3.5 s forces re-authentication (step-up) | **PASS** | /login?response_type=code&redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Fcallback&scope=openid+profile+email+offline_ |
| P6 | max_age=3600 on a recent login passes | **PASS** | http://app1.localhost:4301/callback?code=pEvumqs79Hprf401afV6B2NIjOtQJW52&state=SWbHOCRc2sspFvXa&iss |
| P7 | prompt=login forces re-authentication | **PASS** | /login?response_type=code&redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Fcallback&scope=openid+profile+email+offline_ |
| D4 | Signing key rotation: new key signs, old key stays published for the grace period | **PASS** | rotationInterval=4s; kids before=1 after=2; old token kid=NDaNBxoVIDEtJvOVofZv4qUw0jHm3iKf new token kid=aYPa5WX1WWiFkbD3MNgfZU8lHo1nFOaw; old verifies=true new verifies=true |
| L1 | RP-initiated logout (end_session_endpoint) ends the OP session and redirects back | **PASS** | status 302 location=http://app1.localhost:4301/loggedout?state=bye session after=null |
| L2 | Back-channel logout: RP endpoint receives a valid signed logout_token | **PASS** | POST /bcl ct=application/x-www-form-urlencoded; payload={"iss":"http://auth.localhost:4300","aud":"nsqlOuIiMtKGPsaUKLzERpcgoJzOYEIs","sub":"MsF2nnM3rwshG68DEjLcomrNsWAuOOzA","sid":"CWmBFDNlJAICkvSdoFKPT93AHXQbMtG7","iat":1793547064,"exp":1793547184,"jti":"liZcevxYd30z31G9huMfZSbjF13RWIcY","events":{"http://schemas.openid.net/eve |

### F2.1.1 Rate limiting and brute force
| ID | Requirement | Result | Evidence |
|---|---|---|---|
| S1 | Rate limiting on sign-in (brute-force guard, per IP) | **PASS** | 12 wrong-password attempts from one address -> statuses 401,401,401,429,429,429,429,429,429,429,429,429; first 429 at attempt 4 |
| S2 | While limited, even the correct password is refused (no bypass by switching sessions) | **PASS** | correct password during the window -> 429 |
| S3 | Limit lifts after the window (no permanent lockout of the real owner) | **PASS** | correct password 11 s later -> 200 |
| S4 | Rate limit cannot be dodged with a forged X-Forwarded-For when no trusted proxy is in front | **FAIL** | 8 attempts, each with a different X-Forwarded-For -> 401,401,401,401,401,401,401,401. The default config reads the client address from X-Forwarded-For, so a forged header dodges the limit. Same exposure Caterly already handles: configure advanced.ipAddress.ipAddressHeaders and make Nginx overwrite (not append) the header; must b |
| S5 | Rate limiting on the token endpoint | **PASS** | 40 bad token requests -> 401,429; first 429 at 21 |

### Gaps versus Logto Cloud (Better Auth side only)
| ID | Item | Result | Evidence |
|---|---|---|---|
| G1 | Hosted login UI | **FAIL** (not provided) | loginPage and consentPage are URLs of pages we must build; the spike served placeholders |
| G2 | MFA | **NOT TESTED** | the twoFactor plugin exists in better-auth 1.7.15; not exercised in this spike |
| G3 | Social login | **NOT TESTED** | 36 social providers are exported (google, microsoft, apple, ...); not exercised |
| G4 | Audit trail | **FAIL** (not provided) | no audit table among the 12 tables the provider and auth core create (account, jwks, oauthAccessToken, oauthClient, oauthClientAssertion, oauthClientResource, oauthConsent, oauthRefreshToken, oauthResource, session, user, verification) |
| G5 | Admin console | **FAIL** (not provided) | client registry is API-only; the admin plugin exists but has no UI |
| G6 | Comparison with Logto on any item above | **NOT TESTED** | needs E1; belongs to F2.1.4 |

### F2.1.2 Passwords and stable ids (development data copy)
| ID | Requirement | Result | Evidence |
|---|---|---|---|
| H1 | Stored hash format is Better Auth's scrypt (salt:key, hex) for every credential account | **PASS** | 36 of 36 match ^[0-9a-f]{32}:[0-9a-f]{128}$ (Caterly runs better-auth 1.7.4, the spike runs 1.7.15) |
| H2 | 1.7.15 verifyPassword accepts hashes written by Caterly (1.7.4) | **PASS** | 27 of 36 known-password accounts verify; 9 do not verify with the test password and are exactly the non-e2e accounts: platterly.local, gmail.com, fas.com |
| H2b | Hashes written by 1.7.15 have the same format (so users created after the switch stay compatible both ways) | **PASS** | new hash shape ok=true |
| H3 | Real sign-in over HTTP with the unchanged password hashes | **PASS** | 27 of 27 sign-ins succeeded with no reset; failures=[] |
| H4 | Wrong password and unknown email are refused | **PASS** | wrong password 401, unknown email 401 |
| I1 | sub equals the existing Caterly User.id (read from the original database, not the copy) | **PASS** | 12 of 12 migrated users: id_token.sub == original user.id and email unchanged; e.g. PYBin3jf5HsurfelV6MNlsKqA9GE3zGh |
| I2 | Existing ids need no remapping: ids are opaque strings, unchanged by the move | **PASS** | 27 of 27 sign-in responses returned the original user.id |
| I3 | Caterly-only user columns (isSuperAdmin, firstName, lastName, phone, push*) are not part of the identity record | **PASS** | copy carried only Better Auth core columns and sign-in worked; 1 user(s) have isSuperAdmin in Caterly. These stay in Caterly (or move to Platform Core) — they do not block hash compatibility |
| I4 | Logto password import of Better Auth scrypt hashes | **NOT TESTED** | Needs a Logto tenant (E1); belongs to F2.1.4 |

### F2.1.3 SSO, logout, expiry, cookie cache, token validation (two hosts)
| ID | Requirement | Result | Evidence |
|---|---|---|---|
| O1 | SSO: signed in once at the OP, product 1 logs in with no credential prompt | **PASS** | hops: [["rp start","http://auth.localhost:4300/api/auth/oauth2/authorize?response_type=code&client_i"],["op authorize",302,"http://app1.localhost:4301/api/auth/callback/platterly?code=H7rxqhCUXGvtPNYiNaKwLoS8ACQx4x"],["rp callback",302,"/me"]]; app1 /me={"user":"C8kmBEpJnyc9Tag0oep6SUNeanXOIdDg","email":"sso17935476731405132@exa |
| O2 | SSO: product 2 also logs in with no prompt (second product, same OP session) | **PASS** | app2 /me={"user":"Dr66dsE4xuvspmhuohesBcpIRXTPNOfx","email":"sso17935476731405132@example.test"}; elapsed 70 ms for both |
| O3 | Account link: the product keeps the OP user id as account.accountId (= sub) | **PASS** | OP user.id=PCx0p4oJfnVTJOYBQ6hR3pFJT7TKOz8G; product account.accountId=PCx0p4oJfnVTJOYBQ6hR3pFJT7TKOz8G; product-local user.id=C8kmBEpJnyc9Tag0oep6SUNeanXOIdDg (differs: true) — linking is by sub, so existing Caterly users must be linked by writing account rows, not by renaming ids |
| O4 | No OP session: the product login is sent to the OP login page, not into the product | **PASS** | hops: [["rp start","http://auth.localhost:4300/api/auth/oauth2/authorize?response_type=code&client_i"],["op authorize",302,"/login?response_type=code&redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Fapi%2Fauth%2Fc"]] |
| W1 | Session cookies are host-only (no Domain attribute), HttpOnly, SameSite=Lax | **PASS** | product cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax; OP cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax |
| W2 | Cookies do not leak between auth.localhost, app1.localhost and app2.localhost | **PASS** | OP cookie names=[better-auth.session_token] app1=[better-auth.session_token,better-auth.session_data] app2=[better-auth.session_token,better-auth.session_data]; each jar only holds its own host (browser rule: cookie scope is the host name, not the port) |
| X1 | Product uses a signed session cookie cache (better-auth.session_data) on top of the DB session | **PASS** | cookies on app1: better-auth.session_token,better-auth.session_data; CACHE_TTL=8 s in this spike |
| X2 | Stale session after the DB row is deleted: cache still answers until maxAge, a fresh check refuses at once | **PASS** | right after delete: cached /me=user (stale), fresh /me=null; cached answer ended ~8082 ms later (maxAge 8 s). Worst-case staleness = cookie-cache maxAge, so it must be set at or below the membership-pull bound (5 min) and sensitive actions must use disableCookieCache |
| Y1 | Product sign-out ends its own session and returns the OP end-session URL (RP-initiated logout) | **PASS** | sign-out response: {"success":true,"url":"http://auth.localhost:4300/api/auth/oauth2/end-session?id_token_hint=…&post_logout_redirect_uri=http%3A%2F%2Fapp1.localhost%3A4301%2Floggedout&client_id=GfIFqCyfKYudSAOkKTcZuRTSQIRtxqtd","redirect":true}; app1 session after=null |
| Y2 | Logging out of product 1 ends the OP session and redirects back to the product's post-logout URI | **PASS** | end-session -> 302 http://app1.localhost:4301/loggedout; OP session after=null |
| Y3 | Back-channel logout reaches the OTHER product and kills its session | **PASS** | app2 bcl log: [{"at":1793547681536,"sub":"PCx0p4oJfnVTJOYBQ6hR3pFJT7TKOz8G","sid":"bOm0trVu8X6gQSp7lPw0bx7Z68vaACdf","deleted":true}]; app2 fresh /me=null |
| Y5 | After logout a new product login needs credentials again (no zombie OP session) | **PASS** | hops: [["rp start","http://auth.localhost:4300/api/auth/oauth2/authorize?response_type=code&client_i"],["op authorize",302,"/login?response_type=code&redirect_uri=http%3A%2F%2Fapp2.localhost%3A4302%2Fapi%2Fauth%2Fc"]] |
| Y4 | Back-channel logout takes effect at product 2 immediately even with the signed cookie cache | **FAIL** | 0.8 s after logout: fresh check=null, cached check=STILL SIGNED IN; cached answer stopped after ~7575 ms more (maxAge 8 s). The back-channel call deletes the DB session but cannot clear the browser's cache cookie, so the cache maxAge is the real revocation delay unless sensitive routes use disableCookieCache |
| Y8 | OP 'revoke all sessions' (log out everywhere) notifies the products | **PASS** | revoke-sessions -> 200; back-channel calls to app1: +1; product fresh /me=null |
| Y6 | Plain sign-out at the OP (not end-session) also notifies the products by back-channel | **PASS** | back-channel calls received: app1 +1, app2 +1; product sessions still valid: app1=false, app2=false |
| Y7 | OP-side session deletion (e.g. an admin disables the account) reaches the products | **FAIL** | after deleting the user's OP sessions directly: app1 fresh /me={"user":"XaQz2MAcac7toInkgUsshvushF4UFjdz","email":"sso17935476945024523@example.test"}, app2 fresh /me={"user":"6ZtGjrxLDRKuoDXNhvKSHZDWGmnb6OvE","email":"sso17935476945024523@example.test"}. Nothing tells the products; they rely on the membership-version pull or an |
| Z1 | Product refuses forged back-channel logout tokens (attacker key, unsigned, garbage, empty) | **PASS** | signed by an attacker key (same kid):400; unsigned (alg none):400; garbage:400; empty:400 |
| V1 | ID token validation rejects wrong issuer, wrong audience, wrong nonce, forged/unsigned/altered/confused tokens and accepts the valid one | **PASS** | valid token: ACCEPTED / wrong issuer expected: rejected (ERR_JWT_CLAIM_VALIDATION_FAILED) / token confusion: product 2 receives product 1's token (aud mismatch): rejected (ERR_JWT_CLAIM_VALIDATION_FAILED) / replayed/mismatched nonce: rejected (nonce mismatch) / attacker-signed token reusing the real kid: rejected (ERR_JWS_SIGNAT |
| V2 | Expired ID token (6 s lifetime in this run) is rejected, with no clock tolerance | **PASS** | after 7 s: rejected (ERR_JWT_EXPIRED); with a 60 s tolerance it would be accepted, so tolerance must stay small |
| V3 | Expired access token is inactive at introspection | **PASS** | access token after 7 s: {"active":false} |
| V4 | A refresh token renews expired tokens (new ID token validates) | **PASS** | refresh after access/ID expiry -> id_token valid=true |
| V5 | Product session is independent of OP token lifetime (stays valid after the tokens expire) | **PASS** | 7.5 s after login (tokens live 6 s): product fresh /me={"user":"EMomwe8Npt964VITjM1UTMTmdGOsc16m","email":"sso17935477028093526@example.test"}. Revocation therefore depends on back-channel logout and the membership-version pull, not on token expiry |


## Summary of results
| Part | Tests | PASS | FAIL | NOT TESTED |
|---|---|---|---|---|
| F2.1.1 provider checklist | 40 | 39 | 1 (K3) | 0 |
| F2.1.1 rate limiting | 5 | 4 | 1 (S4) | 0 |
| F2.1.1 gaps versus Logto (Better Auth side) | 6 | 0 | 3 (G1, G4, G5: not provided) | 3 (G2, G3, G6) |
| F2.1.2 passwords and ids | 9 | 8 | 0 | 1 (I4, Logto import) |
| F2.1.3 two-host SSO and tokens | 22 | 20 | 2 (Y4, Y7) | 0 |

Decision rule from the plan (discovery, PKCE, back-channel logout, custom claims): all four **PASS**, so the Better Auth route is not closed by the spike. That is not a choice of provider; F2.1.4 still has to run.

## Limitations and findings that need an owner
| # | Finding | Effect | Mitigation |
|---|---|---|---|
| 1 | The provider refuses `http` redirect URIs for web clients, even `localhost` and `*.localhost` (K3) | Local clients cannot be created through the API | Seed the client table for local use, or run local HTTPS. Production is https anyway |
| 2 | With no `clientPrivileges`, any signed-in user could create an OAuth client (201 observed) | Security hole by default | Set `clientPrivileges` to staff only (verified: ordinary user gets 401) |
| 3 | The ID token carries no email or name by default | Products would see only `sub` | `customIdTokenClaims` (done in the spike) |
| 4 | A forged `X-Forwarded-For` dodges the rate limit when no trusted proxy overwrites it (S4) | Brute force possible if misconfigured | Same setup Caterly already has (`advanced.ipAddress.ipAddressHeaders`, Nginx overwrites the header); retest behind the real proxy at staging |
| 5 | A product's cookie-cached session survives a back-channel logout until the cache `maxAge` (Y4: about 7.6 s of an 8 s maxAge) | Revocation delay equals the cache maxAge | Keep maxAge small (at most the 5 minute membership-pull bound) and use `disableCookieCache` on sensitive routes |
| 6 | Deleting OP session rows directly tells nobody (Y7). Plain sign-out, end-session and `revoke-sessions` do send back-channel logout (Y6, Y8) | A disable or compromise handled by SQL or custom code would not log users out of products | Platform Core must always call the OP's revoke path, never delete rows |
| 7 | Product-side user ids differ from `sub` (O3); the link is `account.accountId = sub` | Existing Caterly users must be linked by writing account rows | Planned in the migration phases; sub equals the existing Caterly User.id (I1) |
| 8 | Discovery is served at the issuer root `/.well-known/openid-configuration`, not under `/api/auth` | A Next.js host needs an explicit route for it | Add a route in `apps/platform` |
| 9 | The relying-party side of `generic-oauth` in 1.7.15 registers a social provider (`/sign-in/social`, callback `/callback/<providerId>`) and the client must use `authentication: "basic"` to match a `client_secret_basic` registration | Differs from older docs | Verify when Caterly is bumped from 1.7.4 |
| 10 | The back-channel URI is checked at registration for private addresses, but delivery to `http://app1.localhost` worked once set directly in the table | A guard exists at registration only | Treat client URIs as staff-controlled data |
| 11 | No hosted login or consent UI, no audit trail, no admin console (G1, G4, G5) | Build effort and ongoing ownership | Weigh in F2.1.4 against Logto's cost |

## Not tested
Logto Cloud in every respect (E1); password import into Logto (I4); MFA and social login end to end; `select_account`, consent screen UI and pairwise subjects; DPoP and `private_key_jwt`; `backchannel_logout_session_required`; logout-token `jti` replay at the product (coded, not exercised); the Next.js integration of the provider (the spike used a Node handler); Caterly's own code running on better-auth 1.7.15; load, clock-skew and production HTTPS cookie behaviour; refresh-token reuse interval.

## Recommendation (no provider chosen)
1. Keep Better Auth + oauth-provider open as a candidate: it passed everything the plan listed as a hard stop, plus password-hash compatibility (27 of 27 known-password accounts sign in unchanged) and `sub` equal to the existing `User.id`.
2. Its cost is what Better Auth does not give: the login, consent and Account screens, a staff client-registry tool, an audit trail, an admin console and the operational care in findings 2, 4, 5 and 6. F2.1.4 should price those against Logto Cloud (cost, India residency, MFA, admin console, hash import).
3. Before D1 is decided, run the bump of Caterly from better-auth 1.7.4 to 1.7.15 in a scratch copy (finding 9). It is a separate phase and was not part of this spike.
4. F2.1.4 and any change to Caterly or Ops authentication wait for your review.
