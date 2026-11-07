# Staging decision record (F1.3.1)

Companion to `docs/staging-requirements-and-runbook.md` (section 12 lists the decisions; this file holds the detail). Updated 2026-11-04 with AJ's two clarifications. **Nothing here is approved unless it says "Decided".** Recommendations are the author's and are marked as such. No application code, credential, environment variable, integration, migration or infrastructure was changed by this document.

## Acceptance (2026-11-04)
**AJ accepted this decision record and the runbook** (`docs/staging-requirements-and-runbook.md`). Acceptance does not resolve the open decisions: each of the 12 keeps the status in the table below.

Qualifications that stay on record:
| Qualification | State |
|---|---|
| Staging | Local machine only. Remote staging infrastructure is deferred until AJ approves it |
| Production decisions | 3, 5 (production), 8, 10, 11 and 12 (production) remain open |
| Local email isolation | Verified at **configuration level** (Stage 1: `.env` of Catering and Ops use a dummy token and the sink at `127.0.0.1:3600`; both apps restarted, health 200) |
| Sink acceptance | Verified (payloads built from each app's `.env` reached the sink) |
| Application-level email delivery, Catering and Ops | **Unverified**; pending a separately approved local end-to-end test |
| Worker environment | **Inferred** (a Next worker's environment cannot be read) |
| Razorpay | Ops uses a `rzp_test_` key locally; catering has none. **Application-level protection against live keys is not implemented** (the code checks key format only and accepts `rzp_live_`) |
| Decision 6b | Handling of real customer copies on AJ's machine remains **Open (local)**, needed before `F10.1.4` |
| Q1 and Q2 (runbook section 11) | Unanswered |

## AJ's clarifications (2026-11-04)
| Decision | Recorded wording |
|---|---|
| 1. Staging environment | "Staging will run on my local machine only for now." No separate staging server, VPS or public staging environment at this stage. All staging testing stays local. Remote staging infrastructure and its related decisions are deferred until AJ explicitly approves them. |
| 4. Mail and Razorpay | ZeptoMail and Razorpay are already used and working. No separate mail sink or second Razorpay account as a default requirement. The existing integrations are retained for local testing. How test email and Razorpay Test mode are kept away from real customers and live payments is documented in section 4a of the runbook. Credentials and modes are not changed. |

## The three tracks
| Track | Meaning | Status |
|---|---|---|
| **Local** | AJ's machine: local databases, `*.localhost` hosts, the existing ZeptoMail and Razorpay Test integrations. This is where all testing happens now (release stage 1, gates L1 to L3). | **Active** |
| **Remote staging** | A server, domain, TLS, access list, offsite backup and a code path to the server (release stage 2, gates S1 to S3, phase `F11.3.1`). | **Deferred. Not approved.** Needs AJ's explicit approval to start. |
| **Production** | The go-live infrastructure (release stage 3). Some production choices (Node version, backup retention, ports, runtime) are shared with remote staging because the same scripts will run in both. | **Separate.** Decided at go-live preparation. |

**Consequence AJ should be aware of.** The plan's stage 2 is defined as a real-server deployment with domains, real email and rollback on that server (Part 1 section 15; Part 3 section 1). A local-only "staging" cannot satisfy those exit conditions. While remote staging is deferred, `F11.3.1` (staging deploy and rehearsal) and therefore `F11.4.1` (production plan) cannot be completed. Local development, testing and AJ's local review (L1 to L3) are not affected. The runbook, plan and RULES.md are not edited to change this; it is recorded here for AJ.

## Decision table
Status words: **Decided**, **Partly decided**, **Deferred** (applies only to a remote staging server and is not approved), **Open (local)**, **Open (production)**.

| # | Decision (as written in the runbook, section 12) | Status | Track | Affects local testing? |
|---|---|---|---|---|
| 1 | Where staging runs: a separate machine, or a separate set of services on one VPS. | **Decided (AJ, 2026-11-04): AJ's local machine only.** The remote options are **Deferred**. | Local | **Yes.** It defines where testing happens. |
| 2 | Host names for staging, certificate approach, and whether it sits behind Cloudflare. | **Deferred** | Remote staging | No. Local uses `*.localhost` and `localhost:<port>`. |
| 3 | The Node version for staging and production (README says 22 LTS or newer; CI and the local machine use 24). | **Open (production)** | Production | No blocker. The local machine already runs 24.21 and CI runs 24. |
| 4 | How staging handles mail (a sink on the server, or another way) and which Razorpay test account and webhook addresses to use. | **Partly decided.** Local: existing ZeptoMail and Razorpay retained, isolation documented, nothing changed. Remote parts (sink on a server, Razorpay account and webhook addresses for a staging host) **Deferred**. | Local / Remote staging | **Yes.** See runbook section 4a. |
| 5 | The backup target, including whether staging gets an offsite copy (and the open production decision). | Staging offsite: **Deferred**. Production target: **Open (production)** (open since 2026-10-12). | Remote staging / Production | No. Local backups use `scripts/backup-db.sh` on this machine. |
| 6 | Whether real customer data may ever be copied to staging for the migration rehearsal, and how it is protected and removed. | **6a** remote staging: **Deferred**. **6b** copies of real customer data on AJ's own machine for the local rehearsals (`F10.1.4`, `F10.1.5`): **Open (local)**, needed before `F10.1.4`, not now. | Remote staging / Local | **Yes, 6b only**, and only when the migration rehearsal starts. |
| 7 | Who gets access to the staging server and how. | **Deferred** | Remote staging | No |
| 8 | The Platform's server port and slot ports. 3300 is already the site hook's default on the server. | **Open (production)**. Needed before the Platform's deploy assets are written (`F10.2.1`). | Production (shared with remote staging) | No. Local stays on 3300 (D14). |
| 9 | Whether staging has its own Sentry project and Wacrm stays off. | Sentry for a staging server: **Deferred**. Local behaviour is documented (runbook section 4a); no decision is needed unless AJ wants it changed. | Remote staging / Local | **Documentation only.** |
| 10 | The retention numbers for monthly backups (the documents disagree). | **Open (production)** | Production (shared) | No |
| 11 | Whether to keep systemd and Nginx blue/green or move to Docker (open since 2026-10-12). | **Open (production)**. Needed before `F10.2.1`. | Production (shared) | No |
| 12 | How the code reaches the server (the git remote), which needs AJ's separate commit and push approvals. | Staging: **Deferred**. Production mechanism: **Open (production)** at the production plan. | Remote staging / Production | No |

### Which decisions still affect local testing
| # | How |
|---|---|
| 1 | Settled: local only. |
| 4 | Settled for the integrations; the isolation rules and open questions are in runbook section 4a. |
| 6b | Will need AJ's decision before the local rehearsals on real customer copies begin (`F10.1.4`). Not needed in W0. |
| 9 | Documentation only: what Wacrm and Sentry do locally today is recorded. |

None of 2, 3, 5, 7, 8, 10, 11 or 12 affects local testing.

### Production decisions (kept separate from local)
| # | When needed |
|---|---|
| 3, 8, 10, 11 | Before the Platform's deploy assets are written (`F10.2.1`, wave W4) and at the latest before the first server backup or deploy. These are decided together with the production plan. |
| 5 | Before go-live (offsite backup storage). |
| 12 (production) | At the production plan (`F11.4.1`). |

### Deferred (remote staging, not approved)
Decisions 1 (remote options), 2, 4 (remote parts), 5 (staging offsite), 6a, 7, 9 (Sentry on a staging server) and 12 (staging). They return only when AJ explicitly approves remote staging.

## Detail for each decision
Recommendations are the author's. They are not approvals.

### 1. Where staging runs
| | |
|---|---|
| **Decided** | AJ's local machine only, for now. |
| **Why it was needed** | The plan wants "separate hosts, databases ... nothing touches production". |
| **Options that were on the table** | A. A separate machine. B. A second set of services on the production VPS. (Both are now deferred.) |
| **Recorded recommendation for when remote staging is approved** | A. The scripts assume one environment per host (`/srv/platterly`, unit names, Nginx include files), so a second set of services on one host would need script changes. |
| **Blocks** | Local: no. Remote staging: this decision is what defers it. |
| **Code or infrastructure change** | None now. |

### 2. Host names, certificate approach, Cloudflare (Deferred)
Apps build their hosts as `<product>.<ROOT_DOMAIN>`. A remote staging root would give catering, Ops, auth, account and store hosts. The options (a staging sub-root under `platterly.in`, a separate domain, or DNS-only without Cloudflare) and the open question of Cloudflare certificate coverage for two-level host names are not decided. `deploy/nginx/platterly.conf` and `deploy/cron/platterly.cron` hard-code production host names and would need staging copies. Nothing is decided or changed now.

### 3. Node version (Open, production)
| | |
|---|---|
| **Why needed** | The server runs the production build; tests run on 24. |
| **Options** | A. Node 24. B. Node 22, at least 22.12. C. Leave it unpinned. |
| **Facts** | `deploy/README.md` line 11: "Node 22 LTS or newer". CI: `node-version: 24` in all four jobs. Local: v24.21.0. Next 16.4.3 needs `>=20.9.0`; Prisma 7.10.1 needs `^20.19 \|\| ^22.12 \|\| >=24`; Vitest 5.0.5 needs `^22.12 \|\| ^24 \|\| >=26`. There is no `.nvmrc` or `engines` field. "22 LTS" is unsafe wording because 22.0 to 22.11 does not satisfy Prisma 7. |
| **Consequences** | A: the same version as CI and the local machine. B: works only from 22.12. C: a server could drift from CI. |
| **Recommendation (not approved)** | A. |
| **Change if decided** | The README line; optionally an `engines` field or `.nvmrc`. Support dates for Node versions are from general knowledge and have not been checked on nodejs.org. |

### 4. Mail and Razorpay (Partly decided)
| | |
|---|---|
| **Decided (local)** | Keep the working ZeptoMail and Razorpay integrations for local testing. No separate mail sink and no second Razorpay account as a default requirement. Nothing about credentials or modes changes. |
| **Why it matters** | Plain local `npm run dev` sends real email through ZeptoMail and nothing in the code limits recipients. Ops has a `rzp_test_` key. Isolation therefore depends on procedure and on facts that are recorded in runbook section 4a. |
| **Deferred** | A mail sink on a server, and the Razorpay account and webhook addresses for a staging host. |
| **Open questions for AJ** | See runbook section 4a: whose the `gmail.com` and `fas.com` addresses in the local database are, and whether the ZeptoMail token and sender in the local `.env` are the ones production will use. |
| **Change** | None. Optional later hardening (a recipient allowlist outside production, a Razorpay key-mode check) would be code changes and need AJ's approval. |

### 5. Backup target (staging deferred; production open)
Backups sit on the same server and `BACKUP_OFFSITE_CMD` is ready, but no storage is chosen (open since 2026-10-12). Options for production: offsite object storage, another server, or none until go-live. A staging offsite copy only matters once remote staging exists. Recommendation (not approved): choose the production target first. Blocks go-live, not local work.

### 6. Real customer data
| | |
|---|---|
| **6a. Remote staging (Deferred)** | Whether copies of the 3 customers' data may ever sit on a staging server. |
| **6b. Local (Open, needed before `F10.1.4`)** | Plan Part 3: the local rehearsals run on data copies on AJ's machine. `migration-data/` is git-ignored and local. Still to be decided: how those copies are protected on the machine and how they are removed afterwards. |
| **Options** | A. Never copy real data off the machine; synthetic data only anywhere remote. B. Anonymised copies. C. Real copies with controls. |
| **Recommendation (not approved)** | A for anything remote. For 6b, the decision about protection and removal is AJ's before `F10.1.4`. |

### 7. Access to the staging server (Deferred)
Not applicable while staging is local.

### 8. Platform server port (Open, production)
| | |
|---|---|
| **Facts** | Server ports: catering 3000 and 3001, Ops 3200 and 3201, the site publish hook 3300 (script default, `deploy/README.md`, the systemd unit comment). The Platform runs on 3300 locally (D14) and `apps/platform/package.json` hard-codes `start -p 3300`. The repository does not reference 3301, 3350, 3400, 3401 or 3501 anywhere. Two services cannot bind the same loopback port, so this only matters when the Platform and the hook share a host. |
| **Options** | A. Platform on 3400 and 3401 on the server. B. Move the hook (it reads `SITE_HOOK_PORT`) and give the Platform 3300 and 3301. |
| **Consequences** | A touches nothing existing. B keeps "local port equals blue slot" but edits the hook's documented setup and Ops' `SITE_DEPLOY_HOOK_URL`. |
| **Recommendation (not approved)** | A. |
| **Change if decided** | The port map and `require_app` in `deploy/bin/lib.sh` and `run-slot.sh`, in phase `F10.2.1`. Not needed locally. |

### 9. Sentry and Wacrm
| | |
|---|---|
| **Sentry** | The `environment` tag defaults to `NODE_ENV`, which is `production` on a server, so a shared DSN would label staging errors "production". Locally the DSN is unset in every `.env`, so nothing is sent. A separate DSN for a staging server is **Deferred**. |
| **Wacrm** | Local state is recorded in runbook section 4a. No decision is needed unless AJ wants it changed. |

### 10. Monthly backup retention (Open, production)
| Source | Says |
|---|---|
| `deploy/README.md` line 41 | "keeps 14 daily, 8 weekly and 12 monthly copies" |
| `deploy/deploy.conf.example` line 10 | `KEEP_MONTHLY_DAYS=365`, under a header saying the values shown are the defaults |
| `deploy/bin/backup.sh` lines 87 and 89 | comment: monthly copies "6 months"; default `KEEP_MONTHLY_DAYS:-183` |

A server set up as the README says copies the example file, so it gets 365; the 183 default applies only if that line is missing. Options: A. 365 days (about 12 copies). B. 183 days (about 6). C. Another number. Recommendation (not approved): A, then align the script's default and comment. The privacy page says data is kept "as long afterwards as is needed for legal, tax and accounting purposes, then delete or anonymise it" and does not mention backups, so the retention chosen should be checked against that wording. Backups are small today (dev databases 43 MB and 41 MB). Change if decided: one line and one comment in `backup.sh`, or the opposite direction in the docs.

### 11. systemd and Nginx, or Docker (Open, production)
Options: A. Keep systemd and Nginx blue/green (built, tested with stand-ins). B. Docker (a rewrite of the deploy scripts, env handling, backups and the restore drill). Recommendation (not approved): A for M1. Needed before `F10.2.1`.

### 12. How the code reaches the server (Deferred for staging; open for production)
`deploy.sh` clones `REPO_URL` (default `git@github.com:theanujal/Platterly.git`) and checks out a ref, defaulting to `origin/main`. All Platform foundation work is currently uncommitted. Options for a server: the existing remote with a read-only deploy key, a private remote on the server, or a copied tarball (which `deploy.sh` does not support). Every commit and push needs AJ's separate approval at the time. Not needed locally.

## What still needs AJ's decision
| Needed | Item | When |
|---|---|---|
| Now | Accept this decision record and the isolation rules in runbook section 4a. | At sign-off of `F1.3.1` |
| Now | Answer the two questions in runbook section 4a (who owns the 7 non-test addresses; whether the local ZeptoMail token and sender are production's). | Before more local email testing |
| Before the local migration rehearsal | Decision 6b. | Before `F10.1.4` |
| Production planning | Decisions 3, 8, 10, 11. | Before `F10.2.1` is built, at the latest before the first server backup or deploy |
| Go-live | Decision 5 (offsite storage) and production's part of 12. | At go-live preparation |
| Only if remote staging is approved | Decisions 1 (remote), 2, 4 (remote), 5 (staging), 6a, 7, 9 (Sentry), 12 (staging). | Not scheduled |
