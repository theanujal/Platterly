# Platterly stub product (F6.3.3)

A deliberately small second product that consumes the Platform contracts, so the contracts are proved before Caterly changes (checkpoint IC2) and a real second product (Rivo) has a reference to copy. **Local only: never deployed, never a customer-facing app.** Plan: `docs/platform-foundation-plan.md` (F6.3.3).

| Piece | Where | What it proves |
|---|---|---|
| OIDC sign-in | `src/lib/oidc.ts`, `/login`, `/auth/callback` | Authorization code + PKCE (S256) + state + nonce; the ID token is validated with `validateIdentityToken` (signature from the provider's JWKS, issuer, one audience, expiry, nonce) before anything is trusted; the email comes from the provider's userinfo (the ID token carries identity only) |
| Sessions | `src/lib/session.ts` | A signed cookie that only points at a database row; the row is looked up on every request, so a logout is felt on the next request |
| Back-channel logout | `src/lib/logout.ts`, `POST /api/platform/logout` | `validateLogoutToken`, a jti accepted once, ends only the sessions of the named provider session (or all of the person's if only `sub`) |
| RP-initiated logout | `/auth/signout` | Ends the stub session, then the provider's end-session endpoint, which ends the provider session and calls every product back |
| Signed events | `src/lib/events.ts`, `POST /api/platform/events` | `receiveEvent` (route-bound signature, parse, id match, sequence guard), applied in one transaction that advances the per-business sequence only if higher |
| Access | `src/lib/access.ts` | Access = an active membership in a business that is not suspended or closed, from the product's own copy, checked on every request |
| Branded sign-in | `public/logo.svg`, the client's `name` and `icon` | The central sign-in page shows this product's name and logo (option B); the logo must be served from this product's own address |
| Manifest | `GET /api/platform/manifest` | What a product tells Platform about itself (the shape is the stub's own proposal; the plan does not define it yet) |

Own scratch database `platterly_stub` (and `platterly_stub_test`) on the F4 cluster (127.0.0.1:55434), migrations in `migrations/`.

## Run it (local)
1. Platform running: `~/.platterly/f4dev/dev.sh` (port 3300), mail sink on 3600.
2. Once: `source ~/.platterly/f4dev/stub-env.sh && node scripts/migrate.mjs` and `STUB_TARGET=test node scripts/migrate.mjs`; register the client with the provider: `cd ../platform && source ~/.platterly/f4dev/env.sh && node scripts/register-product-client.mjs stub`.
3. Stub: `~/.platterly/f4dev/stub-dev.sh` (port 3500, `stub.localhost`). Stop it by port: `kill $(lsof -nP -iTCP:3500 -sTCP:LISTEN -t)`. Restart after adding `proxy.ts` or `instrumentation.ts`.
4. Tests: `source ~/.platterly/f4dev/stub-env.sh && npx vitest run` (17 database tests); browser: from the repo root `npx playwright test -c apps/stub-product/e2e/playwright.config.ts` (11 tests, needs both servers running).

`src/proxy.ts` and `src/instrumentation.ts` only shadow Caterly's own files that Next would otherwise load from the repository root (same reason as in `apps/platform`).

## Not here
Real product registration and secrets (F6.1.1), event publication from Platform's outbox (F6.2.1), the pull API (F6.2.2), the link command (F6.1.2), role mapping (F6.3.2). The stub treats an event's `userId` as the provider `sub`; whether Platform's events use that id is an open design question.
