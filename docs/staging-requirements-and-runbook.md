# Staging: requirements and runbook (F1.3.1)

Written 2026-11-04 for `docs/platform-foundation-plan.md` phase **F1.3.1** ("Servers, hosts, DB, secrets, mail sink, Razorpay test keys, backup target"; done when "Checklist signed by AJ"). Updated the same day with AJ's two clarifications. Decisions, options and recommendations are in `docs/staging-decision-record.md`.

**Scope, as decided by AJ on 2026-11-04.** For now, staging means **AJ's local machine only**. There is no staging server, VPS or public staging environment, and none is being prepared. Everything that only applies to a remote staging server is marked **Deferred** below: it is not approved, and it returns only when AJ explicitly approves it. The existing ZeptoMail and Razorpay integrations stay as they are for local testing (section 4a).

This is a requirements document and a planned procedure. No remote infrastructure exists, the deploy scripts have never run on a real server (`deploy/README.md`: "tested with stand-ins ... not yet on a real server"), and nothing here authorises a deployment.

**Acceptance (2026-11-04).** AJ accepted this runbook and `docs/staging-decision-record.md`. The 12 decisions in section 12 keep their individual statuses; production decisions stay open; remote staging stays deferred. Local email isolation is verified at configuration level and by sink acceptance only: Catering and Ops application-level delivery is unverified and the worker environment is inferred. Razorpay uses a test key locally, with no code-level protection against a live key. Decision 6b is open. Details are in the decision record.

How each line is labelled:

| Label | Meaning |
|---|---|
| **Exists** | The file or script is in the repository now. It has been exercised locally or with stand-ins only. |
| **Partly exists** | Some of it is in the repository; the rest is named in the plan. |
| **Planned (phase)** | The plan names a phase that builds it. It is not built. |
| **Deferred** | Applies only to a remote staging server. Not approved. |
| **Open (production)** | A production or shared-script choice, decided at go-live preparation. Not needed locally. |
| **Decision needed** | The repository and the plan do not say. See `docs/staging-decision-record.md`. |
| **Not defined** | Nothing in the repository or plan covers it. I have not filled it in. |

## 1. Purpose, tracks and entry conditions
| Track | What it is | Status |
|---|---|---|
| **Local** | AJ's machine: local databases, `*.localhost` hosts, the existing ZeptoMail and Razorpay Test integrations. Release stage 1 (gates L1 to L3). | **Active** |
| **Remote staging** | A server, domain, TLS, access list, offsite backup and a code path to it. Release stage 2 (gates S1 to S3, phase `F11.3.1`). | **Deferred. Not approved.** |
| **Production** | The go-live infrastructure. Release stage 3. | Separate. Some choices (Node version, backup retention, ports, runtime) are shared with remote staging because the same scripts run in both. |

| Rule | Source |
|---|---|
| Staging validates deployment (real server, migrations, backups, rollback, domains, email, integrations). It never replaces local testing; a defect found only on staging goes back to local. | Plan Part 1 section 15; Part 3 section 1 |
| Entry to staging: the milestone passed L1 to L3 locally and AJ approved in writing. | Plan section 15 (L3) |
| Exit from staging: S2 critical retests and the section 6 failure scenarios done, evidence shared, AJ approves planning production (S3). | Plan section 15 |
| Staging uses its own hosts, databases, Razorpay **test** keys and a mail sink. "Nothing touches production." | Plan Part 1 section 6 |
| No phase or chunk is deployed on its own; only a milestone is. | Plan Part 3 section 1 |
| Production authentication changes, billing cutover, customer migration and domain switch are separate approvals and out of scope here. | RULES.md rule 9 |

### 1a. What local-only staging can and cannot establish
The plan defines stage 2 as a real-server deployment. A local machine can cover the local equivalents the plan itself names ("stop the identity process, run `deploy/test/test-deploy.sh`, fail a migration on a scratch database", Part 1 section 15) but not the real-server conditions.

| Can be checked locally | Cannot be checked without a remote server |
|---|---|
| Build, typecheck, lint, `check:migrations` | Real-server deployment with systemd units and Nginx |
| Migrations on a scratch copy of a database; a deliberately failing migration | TLS, DNS, Cloudflare behaviour, the Cloudflare IP trust list |
| The blue/green script logic, with the stand-ins in `deploy/test/test-deploy.sh` | Rollback and the drain window on a real server |
| A database backup and restore with `pg_dump` on scratch databases (`npm run db:backup`, `scripts/backup-db.sh`) | `backup.sh`, the nightly cron, the restore drill and an offsite copy on a server |
| Journeys, permissions and failure scenarios with targeted Playwright and Vitest | Email deliverability from the real sending domain to real mailboxes |
| Test emails (section 4a) and Razorpay Test mode checkout | Razorpay webhooks reaching a public address |
| Stopping a local process to simulate a provider outage | Clock skew between hosts, real network partitions |

**Consequence (recorded, not decided here).** While remote staging is deferred, `F11.3.1` (staging deploy and rehearsal) and so `F11.4.1` (production plan) cannot be completed. Local development, testing and AJ's local review (L1 to L3) continue unchanged. The plan and RULES.md are not edited to reflect this.

## 2. Infrastructure requirements
| Requirement | What the repository says | Where it stands |
|---|---|---|
| A server for staging | Plan: "separate hosts". | **Deferred** (AJ, 2026-11-04: local machine only) |
| Server software | Postgres 16, Nginx, Node "22 LTS or newer", git, curl, gpg; a `platterly` user (`deploy/README.md` step 1). CI runs Node 24 and Postgres 16; the local machine runs Node 24.21 and Postgres 16. | Exists (as a list). The Node version for servers: **Open (production)** |
| Folders, ownership | `/srv/platterly/{bin,env,state,uploads,site-media,backups,site}` and others (README step 2) | Exists (as steps). **Deferred** for staging |
| Host names, DNS, TLS, Cloudflare | Production names are in `deploy/nginx/platterly.conf`. No staging domain exists. No Nginx block exists for the Platform's `auth.`, `account.` and `store.` hosts. | Staging names and certificate: **Deferred**. Platform Nginx block: **Planned (F10.2.1)** |
| Local hosts | `*.localhost` resolves to this machine: `catering.localhost:3000`, `ops.localhost:3200`, `auth.`, `account.` and `store.localhost:3300`. | **Exists** |
| Reverse proxy and process manager | Nginx with an upstream file per app; systemd template `platterly-app@.service`. Docker is an open alternative. | Exists for catering and Ops. Platform: **Planned (F10.2.1)**. Runtime choice: **Open (production)** |
| Databases | Local: `platterly_dev`, `platterly_ops`, `platterly_platform`, each with its own role. The identity provider's own database depends on D1 (open). | Local: **Exists**. Identity: **Not defined** until D1 |
| Mail | The existing ZeptoMail integration, plus an optional local sink already built into `npm run dev:all`. No separate sink is required (AJ, 2026-11-04). | **Exists.** See section 4a |
| Payments | The existing Razorpay integration; Ops uses a `rzp_test_` key locally. No second Razorpay account is required (AJ, 2026-11-04). | **Exists.** See section 4a |
| Razorpay webhook addresses for a staging host | Ops `/api/webhooks/razorpay` (events `payment.captured`, `payment.failed`) and the catering platform webhook, registered against a staging host name. | **Deferred** |
| Backups | Local: `npm run db:backup` writes dumps on this machine. Server: `backup.sh` writes to `BACKUP_DIR` on the server. | Local: **Exists**. Offsite target for staging: **Deferred**. Production target: **Open (production)** |
| Cron | Locally `npm run cron:local` calls the cron endpoints. On a server `deploy/cron/platterly.cron` does. The Platform has no cron route yet (the outbox worker is `F3.3.2`). | Exists (local and for catering and Ops on a server). Platform: **Planned** |
| Error monitoring | Sentry through `SENTRY_DSN`; unset means off. Unset in all three local `.env` files. | Local: off. A staging Sentry project: **Deferred** |
| Access for the people who deploy | Not stated in the repository. | **Deferred** |
| Code reaching a server | `deploy.sh` clones `REPO_URL` and checks out a ref. | **Deferred** for staging; production mechanism **Open (production)** |

## 3. Services and dependencies
| Service | Port | Needs | Where it stands |
|---|---|---|---|
| Catering | 3000 locally; server slots 3000 and 3001 | Postgres, env file, cron | **Exists** |
| Ops | 3200 locally; server slots 3200 and 3201 | its own Postgres database, env file, cron, `OPS_SECRETS_KEY` | **Exists** |
| Marketing site | 3100 locally | n/a | **Exists** |
| Marketing site publish hook | **3300** by default on the server (`SITE_HOOK_PORT`; `deploy/README.md`; the systemd unit comment) | `site-hook.env`, a clone at `/srv/platterly/site-repo` | **Exists** (server only) |
| Platform | **3300 locally** (D14). No server port is decided; the hook already uses 3300 on the server. | Postgres `platterly_platform`, env file | **Partly exists.** Server port: **Open (production)** |
| Stub second product | 3500 locally (D14) | not built | **Planned (F6.3.3)** |
| Identity provider | not decided | Better Auth inside the Platform, or Logto Cloud | **Not defined** until D1 (and E1 for Logto) |
| Mail sink | 3600 locally | none | **Exists**, optional, local only |
| Wacrm (WhatsApp) | n/a | `WACRM_*` | See section 4a |
| Redis, queues, object storage | Not used by anything in `deploy/` or the env examples | n/a | Not part of the current deployment. Files stay on the server (AJ, 2026-10-12). |

## 4. Environment variables and secrets
Names are taken from the `.example` files. **No values appear here, and none belong in the repository.** This section does not change any variable or credential.

| Rule | Detail |
|---|---|
| Local | Each app reads its own `.env` (git-ignored). Platform's has only `ROOT_DOMAIN` and `DATABASE_URL`. |
| On a server (**Deferred** for staging, **Open (production)**) | One file per app, `/srv/platterly/env/<app>.env`, mode 600, owner `platterly`; both blue and green read the same file (`deploy/README.md` step 3). |
| Never shared with production | A secret generated for one environment is never copied to another. |
| Test credentials | Razorpay Test mode locally; no live Razorpay keys, no live WhatsApp send, no Sentry locally. |
| Generated once, kept | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: the same in both slots. `OPS_SECRETS_KEY`: set before the first run and never changed (`docs/production-checklist.md`). |
| Platform-reader secret | Provisioned on Ops with `npm --prefix apps/ops run platform-reader -- provision` (`docs/platform-reader-secret.md`). Not done yet on the real Ops database. |

| App | Names (from the example file) |
|---|---|
| Catering (`deploy/env/catering.env.example`) | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ROOT_DOMAIN`, `PAYMENT_SECRETS_KEY`, `CRON_SECRET`, `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM`, `EMAIL_LOGO_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `OPS_BASE_URL`, `OPS_PRODUCT_KEY`, `OPS_EVENT_SECRET`, `OPS_COMMAND_SECRETS`, `OPS_BILLING`, `WACRM_*`, `UPLOAD_ROOT`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Ops (`deploy/env/ops.env.example`) | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `OPS_TRUSTED_ORIGINS`, `OPS_SECRETS_KEY`, `CRON_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM`, `WACRM_*`, `SITE_SECRET`, `SITE_DEPLOY_HOOK_URL`, `STAFF_NOTIFY_EMAILS`, `SITE_MEDIA_DIR`, `SITE_ORIGINS`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Site hook (`deploy/env/site-hook.env.example`) | `SITE_SECRET`, `OPS_CONTENT_URL`, `OPS_RESULT_URL`, `SITE_REPO_DIR`, `SITE_WEB_ROOT`, `NEXT_PUBLIC_ENQUIRY_ENDPOINT` |
| Platform (`apps/platform/.env.example`, today) | `ROOT_DOMAIN`, `DATABASE_URL`. No `deploy/env/platform.env.example` exists (planned in `F10.2.1`), and the variables later phases need are not defined. |

### 4a. Test email, Razorpay Test mode and WhatsApp: isolation on the local machine
Decision (AJ, 2026-11-04): the ZeptoMail and Razorpay integrations that already work are kept for local testing. No separate mail sink or second Razorpay account is required, and no credential, mode or environment variable is changed. This section records what is true today and the rules that keep local testing away from real customers and live payments. It was checked on 2026-11-04 by reading code and `.env` files for **names and public prefixes only; no secret value was read or printed**.

**Email (ZeptoMail)**

| Fact | Evidence |
|---|---|
| `sendEmail` posts to ZeptoMail with `ZEPTOMAIL_TOKEN` and `ZEPTOMAIL_FROM`. If either is missing it sends nothing and the caller logs "skipped". Ops has the same code. | `src/lib/notifications/email/zeptomail.ts`; `apps/ops/src/modules/messages/zeptomail.ts` |
| The token and sender are set in the catering `.env` and in `apps/ops/.env`. So plain `npm run dev` and `npm --prefix apps/ops run dev` send **real email**. | `.env` check (set or unset only) |
| `npm run dev:all` points the apps it starts at the local mail sink instead (API URL `localhost:3600`, token `local-sink`, sender `noreply@platterly.localhost`), so nothing leaves the machine. It starts only apps that are not already listening; an app already running keeps its own environment. | `scripts/local/dev-all.mjs` line 24; `apps/platform/README.md` |
| **The code has no recipient guard.** A search of the mail code found no allowlist, redirect or "only send to" setting, so a local run emails whatever address is entered. | Code search |
| The Platform sends no email: its `.env` has no mail or payment variables. | `apps/platform/.env` check |
| Ops emails the addresses in `STAFF_NOTIFY_EMAILS` when events occur (the variable is set locally). | `.env` check (name only) |
| Users in `platterly_dev`: 55 at `example.test`, 6 at `gmail.com`, 2 at `platterly.local`, 1 at `fas.com`. In `platterly_ops`: 1 at `platterly.local`. `.test` is a reserved top-level domain with no real mailboxes. | Counts by domain only |

Rules for local email (procedure, because no code guard exists):

| # | Rule |
|---|---|
| M1 | Local email tests target only addresses AJ owns, or the reserved `example.test` style addresses the tests already use. |
| M2 | Never enter an address belonging to the 3 existing customers, their staff or their customers, or any real caterer or prospect, in a local sign-up, invitation, order or lead form. |
| M3 | A test whose point is "nothing is sent" uses `npm run dev:all` (the sink), after checking its output for which apps it started and which it found already running. |
| M4 | Copies of real customer data (decision 6b, before `F10.1.4`) go into separate scratch databases, never into `platterly_dev` or `platterly_ops`, because those databases drive live local email. |

**Razorpay**

| Fact | Evidence |
|---|---|
| Ops has `RAZORPAY_KEY_ID` with the public prefix **`rzp_test_`** (Test mode), and a key secret and webhook secret (values not read). | `apps/ops/.env` check |
| The catering `.env` has no Razorpay keys. Catering's own plan billing goes through Ops, and `OPS_BILLING` is set locally. | `.env` check; `docs/ops-cutover.md` |
| A kitchen's own Razorpay keys are entered in Settings, Integration, Payments and stored encrypted. The code accepts a `rzp_test_` or a `rzp_live_` key by **format only**; it does not check the mode against anything. | `src/modules/payments/payment-settings.ts` line 98 |
| Razorpay's API address is the same for both modes. The **key** decides the mode, so a live key entered locally would take live payments. | `src/modules/payments/razorpay.ts` |
| Razorpay's servers cannot reach `localhost`, so local runs receive no webhooks unless a tunnel is used. No tunnel is in the repository; whether one is in use is not known. Webhook handling is covered by signed-request unit tests. | Repository search (not verified further) |
| No `rzp_live_` key was found in the local Ops `.env`, and the catering `.env` has none. | `.env` check |

Rules for local payments:

| # | Rule |
|---|---|
| P1 | Only `rzp_test_` keys, in every local `.env` and in every local kitchen's payment settings. Never enter a `rzp_live_` key locally. |
| P2 | To check the mode without printing a secret: `grep -E '^RAZORPAY_KEY_ID=' apps/ops/.env \| cut -d= -f2 \| tr -d '"' \| cut -c1-9` should print `rzp_test_`. |
| P3 | Use Razorpay's documented Test mode payment methods only. |
| P4 | Do not register a Test-mode webhook that points at a production address. Live webhooks are registered at go-live only. |
| P5 | Local Ops data is test data. It is never imported into production. |

**WhatsApp (Wacrm) and Sentry**

| Fact | Evidence |
|---|---|
| The catering `.env` has `WACRM_API_KEY` and `WACRM_TEST_TO` set. While `WACRM_TEST_TO` is set every message goes to that one number, so local WhatsApp tests reach only that number (AJ, 2026-10-09). Ops has no Wacrm settings locally. | `src/lib/notifications/whatsapp/wacrm.ts`; `.env` check |
| `SENTRY_DSN` is unset in all three local `.env` files, so nothing is sent to Sentry locally. | `.env` check |

**Open questions for AJ (not answered by anything I read)**

| # | Question | Why it matters |
|---|---|---|
| Q1 | Whose are the 6 `gmail.com` addresses and the 1 `fas.com` address in `platterly_dev`? | A local test email to them leaves for real through ZeptoMail. |
| Q2 | Are the ZeptoMail token and sender in the local `.env` the ones production will use? (The go-live decisions say the production token comes at go-live.) | If they are, local tests send from the real sending domain and count toward its limits and reputation. I did not read the values. |

**Gaps this section does not fix** (no code or environment changes were allowed): there is no recipient guard for email, no mode check for per-kitchen Razorpay keys, and running servers keep the environment they started with. Optional later hardening, such as a recipient allowlist outside production or a key-mode check, would be code changes and needs AJ's approval.

## 5. Database setup and migrations
| Step | Procedure | Where it stands |
|---|---|---|
| Local roles and databases | One database and role per app. Platform: role `platterly_platform_app` (LOGIN CREATEDB), database `platterly_platform` (`apps/platform/README.md`). | **Exists** (local) |
| Data-safety rule | A release adds; it never removes or rewrites data. `npm run check:migrations` blocks risky SQL. Never `migrate dev`, `migrate reset` or `db push` on a server (`docs/data-safety.md`). | **Exists** |
| Guard | `check:migrations` covers the catering and Platform migration folders. Ops migrations are not covered (stated in `scripts/check-migrations.mjs`). | **Exists**, with that gap |
| Local migration test | Apply a migration to a scratch copy of a database first. | **Exists** (as practice) |
| Server steps (backup before migrating, `migrate deploy` per app, pre-checks, seed, Ops set-up) | `deploy.sh` backs up and migrates; `docs/production-checklist.md`; `scripts/pre-migrate-duplicate-check.sql`; `npm run db:seed-catalog`; `docs/ops-cutover.md` steps 1 to 9. | **Exists** (as scripts and steps). Running them on a staging server: **Deferred** |
| Member uniqueness | Step a is done locally with zero duplicates (`docs/member-duplicate-audit-results.md`); `scripts/member-duplicate-audit.sql` is reusable. A fresh audit on staging data is `F8.2.3f`. | Local: **Exists**. Staging audit: **Deferred** |
| Real customer data for the migration rehearsal | Decision 6: remote copies **Deferred**; copies on AJ's own machine for `F10.1.4` and `F10.1.5` are an open local decision, needed before then. | **Open (local)**, not yet needed |

## 6. Deployment sequence
### 6a. Local (active)
| # | Step | Where it stands |
|---|---|---|
| 1 | L1: build, typecheck, lint, `check:migrations` | **Exists** |
| 2 | L2: targeted Vitest and Playwright (never the full suite, RULES.md 7 and 8), with the existing ZeptoMail and Razorpay Test integrations under the rules in section 4a | **Exists** |
| 3 | The plan's local failure-scenario equivalents (stop a local process, `bash deploy/test/test-deploy.sh`, fail a migration on a scratch database) | **Exists** |
| 4 | L3: AJ reviews the whole experience locally and approves in writing | **Pending** (per milestone) |

### 6b. Remote staging (**Deferred**; nothing below is approved)
| # | Step | Where it stands |
|---|---|---|
| 0 | AJ approves remote staging and answers its decisions; a SHA is chosen and pushed with AJ's approval. | Deferred |
| 1 to 4 | Prepare a server, env files, scripts, systemd, Nginx and cron (`deploy/README.md` steps 1 to 5 and 7); first `deploy.sh catering <sha>` then `deploy.sh ops <sha>`. | Deferred (the steps **Exist** as documents) |
| 5 | Ops set-up with test credentials (`docs/ops-cutover.md` steps 1 to 9) and the platform-reader secret. | Deferred |
| 6 | Platform: database, role, env file, Nginx block, unit, ports, `migrate deploy`, health check. | Deferred; **Planned (F10.2.1)** |
| 7 | Smoke tests (section 7), failure scenarios (plan Part 1 section 6), evidence and sign-off. | Deferred |

Release order for several apps: catering, then Ops (`docs/production-checklist.md`).

## 7. Health checks and smoke tests
| Check | How | Where it stands |
|---|---|---|
| Each app answers | `GET /api/health` returns `{"status":"ok"}`; Ops adds `"app":"ops"`, the Platform `"app":"platform"`. | **Exists** |
| All local apps | `npm run smoke:local` checks the local health addresses. | **Exists** (local) |
| A new slot is healthy before traffic moves | `deploy.sh` polls the slot for up to `HEALTH_TIMEOUT` (default 90 s) before switching Nginx. | **Exists** (server, stand-in tested). Deferred for staging |
| What is live | `status.sh` | **Exists** (server) |
| Post-switch checks | `docs/ops-cutover.md` "After the switch" | **Exists** (as steps) |
| Ops product list | A signed request to `/api/platform/products` answers 200; without a secret, 401. In production mode it requires `X-Forwarded-Proto: https`, which Nginx sets. | **Exists** |
| Critical journeys on a staging host | Playwright configs point at `localhost` hosts today. | Deferred; a remote configuration is **Not defined** |
| Platform alerts | Sentry and monitoring arrive in `F10.2.2`. | **Planned** |

## 8. Rollback
| Case | Procedure | Where it stands |
|---|---|---|
| Local | Restore the scratch or dev database from a `pg_dump` taken first; the previous code is the previous commit. | **Exists** (as practice) |
| Bad release after the traffic moved (server) | `rollback.sh <app>`: instant within `DRAIN_MINUTES` (default 10), afterwards it restarts the previous slot first. | **Exists** (stand-ins only). Deferred for staging |
| Failed health check | Traffic never moved; the idle slot is stopped. | **Exists** |
| Migrations | Never undone. Releases only add. A destructive change ships in two releases. | **Exists** (rule) |
| Billing | Unset `OPS_BILLING` and restart catering. | **Exists** |
| Platform on a server | No deploy assets yet. | **Planned (F10.2.1)** |
| On a real server | Never exercised. | Deferred |

## 9. Backup and recovery
| Topic | What exists | Gap |
|---|---|---|
| Local | `npm run db:backup` (`scripts/backup-db.sh`) dumps the one database named by `DATABASE_URL` into `backups/` on this machine. | It covers one database per run, so each of `platterly_dev`, `platterly_ops` and `platterly_platform` needs its own run. |
| Server `backup.sh` | The catering and Ops databases (each dump read back and checksummed), uploads, Ops site pictures, and a gpg-encrypted copy of the env files; nightly 02:15 and before each deploy that migrates. | **The Platform database is not included** (planned in `F10.2.1`). |
| Restore drill | `restore-drill.sh` restores the newest catering and Ops dumps into scratch databases and compares counts; Sundays 03:30. | Platform not included. Never run on a real server. |
| Retention | Fourteen daily copies; weekly and monthly copies as hard links. | **The documents disagree on monthly retention** (12 copies, 365 days, 183 days). **Open (production)**; see the decision record. |
| Offsite copy | `BACKUP_OFFSITE_CMD` is ready; no storage is chosen. | Staging: **Deferred**. Production: **Open (production)**. |
| Identity database | The scratch spike designed a recovery procedure. None of it is built or approved, and the provider is not chosen (D1). | **Not part of F1.3.1.** |

## 10. Security and access requirements
| Requirement | Applies to | Source or basis |
|---|---|---|
| Test email goes only to addresses AJ controls; Razorpay keys are Test-mode keys; no live key is ever entered locally. | **Local** | Section 4a |
| Real customer copies live only in separate scratch databases on AJ's machine. | **Local** | Section 4a (M4), plan Part 3 |
| No production credential is present on the local machine without AJ's decision (Q2 open). | **Local** | RULES.md rule 9 |
| Staging credentials separate from production in every system. | Remote staging (**Deferred**) | Plan section 6 |
| Env files mode 600, owner `platterly`; env copies in backups encrypted; passphrase kept offline. | Server | `deploy/README.md` |
| Only Nginx is reachable; apps listen on 127.0.0.1; cron endpoints loopback-only. | Server | `run-slot.sh`, `platterly.conf` |
| Nginx overwrites `X-Forwarded-For` and `X-Forwarded-Proto`. | Server | `platterly.conf` |
| `CF-Connecting-IP` trusted only behind Cloudflare. | Server | `platterly.conf` |
| TLS on every host; the Ops product-list route refuses non-https in production. | Server | `platform-list.ts` |
| Who may log in to a server and deploy. | Remote staging (**Deferred**) | Not defined |
| Staging not indexed. The Platform already sends `X-Robots-Tag: noindex, nofollow` and `X-Frame-Options: DENY`. | Any | `apps/platform/next.config.ts` |
| No production authentication change, billing cutover, customer migration or domain switch from a staging task. | Any | RULES.md rule 9 |

## 11. Verification and sign-off checklist
### A. Local (the checklist AJ can sign now)
| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | The scope above is accepted: staging is local only, remote staging deferred | AJ's acceptance, 2026-11-04 | **Accepted** |
| 2 | The isolation rules in section 4a are accepted | AJ's acceptance of the runbook, 2026-11-04. Stage 1 isolation verified at configuration level only; application-level delivery unverified | **Accepted, with the qualifications above** |
| 3 | Q1 answered (the 7 non-test addresses in `platterly_dev`) | AJ's answer | Pending |
| 4 | Q2 answered (is the local ZeptoMail token and sender production's) | AJ's answer | Pending |
| 5 | The Razorpay key mode in the local Ops `.env` is `rzp_test_` (command P2) | Output of P2 | Observed 2026-11-04 (`rzp_test_` in Ops; catering has no key); not a code-level guard | Observed, protection not implemented |
| 6 | The plan's local failure-scenario equivalents run (`deploy/test/test-deploy.sh`, a failing migration on a scratch database) | Output | Pending |

### B. Remote staging (**Deferred**, nothing here is approved)
| # | Item | Status |
|---|---|---|
| 1 | Remote staging approved by AJ and its decisions answered | Deferred |
| 2 | Server, access, host names, TLS | Deferred |
| 3 | Env files, databases and roles, `migrate deploy` per app | Deferred |
| 4 | Member duplicate audit on staging data | Deferred |
| 5 | First deploy, health, traffic switch | Deferred |
| 6 | Platform deployed (after `F10.2.1`) | Deferred |
| 7 | Mail and Razorpay checks against a staging host, webhook replay | Deferred |
| 8 | Backup and restore drill, including the Platform database | Deferred |
| 9 | Rollback within and after the drain window | Deferred |
| 10 | Every Part 1 section 6 failure scenario rehearsed | Deferred |
| 11 | Critical journeys repeated on staging | Deferred |

| Sign-off | Name | Date | Signature |
|---|---|---|---|
| Staging requirements accepted (F1.3.1) | AJ | | |
| Remote staging results reviewed (S3, only if remote staging is approved) | AJ | | |

## 12. Decisions
The full record, with options, consequences and recommendations, is in `docs/staging-decision-record.md`. Status words there: **Decided**, **Deferred** (remote staging only, not approved), **Open (local)**, **Open (production)**.

| # | Decision | Status | Affects local testing? |
|---|---|---|---|
| 1 | Where staging runs | **Decided (AJ, 2026-11-04): local machine only.** Remote options **Deferred** | Yes (defines it) |
| 2 | Host names, certificate, Cloudflare | **Deferred** | No |
| 3 | Node version | **Open (production)** | No (local is on 24.21) |
| 4 | Mail and Razorpay | **Partly decided.** Local: existing integrations retained, isolation in section 4a. Remote parts **Deferred** | Yes |
| 5 | Backup target and offsite copy | Staging **Deferred**; production **Open (production)** | No |
| 6 | Real customer data | 6a remote **Deferred**; 6b local copies **Open (local)**, before `F10.1.4` | 6b only |
| 7 | Access to the staging server | **Deferred** | No |
| 8 | Platform server port | **Open (production)**, before `F10.2.1` | No |
| 9 | Sentry and Wacrm | Sentry for a staging server **Deferred**; local behaviour documented in 4a | Documentation only |
| 10 | Monthly backup retention | **Open (production)** | No |
| 11 | systemd and Nginx, or Docker | **Open (production)**, before `F10.2.1` | No |
| 12 | How the code reaches a server | Staging **Deferred**; production **Open (production)** | No |

## 13. What this document does not claim
- That a staging server, domain, certificate, remote database or credential exists, or is being prepared.
- That any deploy script has run on a real server, or that rollback has been exercised.
- That the Platform can be deployed with today's `deploy/` assets: `deploy.sh`, `rollback.sh`, `run-slot.sh`, `status.sh`, `backup.sh` and `restore-drill.sh` know only catering and Ops.
- That local-only staging satisfies the plan's stage 2 (see section 1a).
- That local email or payments are protected by code. Protection today is procedure plus the facts in section 4a.
- Anything about identity-provider infrastructure, which depends on D1.
