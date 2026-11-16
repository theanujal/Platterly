# Go-live order: central sign-in only

Decision (AJ, 2026-11-17): Caterly has **one** way in, the Platterly central sign-in. There is no switch back to the old forms (the old forms are deleted). So the
order of go-live is what keeps Bhandarys from being locked out. **Never release catering before the Platform is live and the people are in its identity database.**

Safety net: `deploy/bin/deploy.sh catering` now refuses to build, migrate or switch unless `PLATFORM_AUTH_ORIGIN` is set in `catering.env` and
`<origin>/api/auth/.well-known/openid-configuration` answers. A hotfix deployed from `main` before the Platform is live stops there with nothing changed.
Because `main` can then carry the sign-in code safely, merging `signin` into `main` is no longer the cutover; step 7 below is.

## Steps (each one is checked before the next; nothing here has been run on a real server)

| # | Step | Check before moving on |
|---|---|---|
| 1 | **Back up** the catering and Ops databases (`deploy/bin/backup.sh`). | Backup verified, restore drill passes. |
| 2 | **Ops**: `deploy.sh ops` (applies Ops migrations, 42 in total today). Register the products and clients (`apps/platform/scripts/register-product-client.mjs`) and copy the secrets. | Ops healthy; the Caterly product shows in Registry. |
| 3 | **Platform database**: create the Platform and identity databases, `prisma migrate deploy` in `apps/platform` (8), then `npm --prefix apps/platform run identity:migrate` (`0001` to `0015`). | Both report up to date. |
| 4 | **Platform app** up on its own port with its env file, Nginx blocks for the auth, account and store hosts, TLS, and its systemd unit. Written, not yet run on a server: `deploy.sh platform` (ports 3400/3401, runs `prisma migrate deploy` and `identity:migrate`), `deploy/env/platform.env.example`, the three-host block in `deploy/nginx/platterly.conf`, four cron lines, and backups of both Platform databases and its saved pictures. | `auth.platterly.in/api/auth/.well-known/openid-configuration` answers over https. |
| 5 | **Bring the people over** from a *copy* of the live catering database: `import-caterly-users.mjs` (dry run, then `--apply`; keeps each person's id and their existing password), then `backfill-common-details.mjs`. Confirm with `check-imported-login.mjs` for one real person. Bhandarys keep their password. | Dry-run counts match the catering user count; conflicts list is empty. |
| 5b | **Create the Platform businesses** for the existing kitchens: `CATERLY_BUSINESS_IMPORT=dry|apply CATERLY_COPY_DATABASE_URL=... DATABASE_URL=... npx vitest run legacy-business-import.run --silent=false` in `apps/platform` (dry run first; the runner only accepts `platterly_platform` or the scratch `platterly_rehearsal_platform` as target, and a copy as source). A business whose Admin has not yet signed in centrally **waits** and is created by a later run, so repeat this step after the first sign-ins (it is safe to repeat). | Report shows no `refused` and no `noBusinessId`; `waitingForFirstSignIn` lists the owners who have not signed in yet. |
| 6 | **Link** them on the live catering database: `scripts/link-platform-accounts.mjs` (dry run, then `--apply`; adds rows only). Run it again after a final import, just before step 7, to pick up anyone who signed up in between. | `caterlyOnly` is 0 in the report. Then `scripts/compare-business-ids.mjs` (read-only; catering, Ops and Platform database URLs): every Platform business must exist in Ops and catering under the same id (exit 0). |
| 7 | **Catering**: set `PLATFORM_AUTH_ORIGIN`, `PLATFORM_ACCOUNT_ORIGIN`, `PLATFORM_STORE_ORIGIN` in `catering.env`, then `deploy.sh catering` (6 migrations on this branch's way, 97 in total today). The preflight passes only if step 4 is done. | A Bhandarys person signs in through the central page and lands in their kitchen. |
| 8 | **Prove it**: sign in, sign out, wrong password, forgot password, Store link, Account link. `rollback.sh catering` is the way back (migrations are additive; the old release has no login form to roll back to, which is why the order above matters). | |

Anyone who joins after step 5 and before step 7 signs up at the Platform through Caterly and is picked up by the second link run. Nobody signs up on the old
forms: there are none after the release.

## Still to build before this can run
1. (Done in files, still to prove on a server.) The Platform's deploy files.
2. A rehearsal of steps 3 to 7 on a copy of the live databases (local first, per the release process).
3. Sharath's question (Platform organisation id = Ops `Business.id`): traced in code and confirmed on the local dev databases with `scripts/compare-business-ids.mjs` (every Platform business exists in Ops). Run it again on the rehearsal copy and before step 7.

## Rehearsal result (2026-11-16, AJ's Mac only, scratch copies of the local databases)
Source: a dump of the local catering database (4 people, 2 businesses). Scratch databases: `platterly_rehearsal_catering` (port 5432, link target), `platterly_rehearsal_catering_copy`, `platterly_rehearsal_identity` and `platterly_rehearsal_platform` (F4 cluster, 55434). No real dev database was written to.

| Step | Result |
|---|---|
| Identity migrations `0001` onwards on an empty database | All applied; Account and Store clients registered. |
| Platform `prisma migrate deploy` on an empty database | All 8 applied. |
| Import users (dry run, then apply) | 4 of 4 added, 4 credential accounts, 0 email conflicts, 1 added unverified (gets a code at first sign-in). |
| Password carry-over | For all 4 people, user id, password hash and verified flag are identical in catering and in the identity database, so each keeps their password. (Checked by comparing, not by typing a password.) |
| Backfill of common details (dry) | Nothing to change. |
| Link (dry, apply, repeat) | 3 linked (1 already was); a second run adds nothing; `caterlyOnly` is 0. |
| Business import (dry) | 2 businesses found, 0 created, both **waiting for the owner's first central sign-in** (by design; see step 5b). |
| Id comparison | Exit 0. Platform has 0 businesses yet, so the 2 catering ids and Ops's 18 are listed as not yet in the Platform (expected before first sign-ins). |

Not covered: a real browser sign-in (a person typing their password against the running apps pointed at these scratch databases), the Platform app deploy itself, email delivery, and a rehearsal on real Bhandarys data (the local database holds test data plus the two kept accounts).
