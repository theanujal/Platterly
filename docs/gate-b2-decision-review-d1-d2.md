# Gate B-2 decision review: D1 (identity provider) and D2 (session policy)

**Status: review document for AJ. Not a decision.** It recommends nothing on AJ's behalf where AJ has not decided, and it changes no plan, register, code, schema, migration or service. The review text itself chooses and approves neither D1 nor D2; the Decision record below records AJ's later decisions. `F3.2.1` is not authorised by it. **Update 2026-11-05: AJ has since decided D1 (Option A: Better Auth), approved the D2 session policy at policy level with technical values delegated to design, and approved closing `F0.1.5` by explicit exception without completing `F2.1.4` or `F2.1.5`; see the Decision record below. The rest of this document is kept as written at the time of review.**

Prepared 2026-11-05. Purpose: unblock the real Account application at `account.localhost`. The F7 audit found the current Account application is a mock-data prototype with no registration, sign-in, session or backend, and that sign-in and a real profile (`F7.1.1`, `F7.1.2`) wait on Gate B-2.

## Decision record (2026-11-05)

| Item | Record |
|---|---|
| **D1: identity provider** | **Decided by AJ on 2026-11-05: Option A. Better Auth is selected.** AJ explicitly approved proceeding without completing the Logto comparison first. Recorded in `docs/f5-decision-register.md` section 2.7 |
| Exception | `F2.1.4` (Logto comparison) is **deferred** by this explicit exception: not completed, not cancelled. This is the exception described in section 1 (exception rule) and section 5 (Option A) |
| Basis | The existing Better Auth spike evidence (sections 3.1 and 4) remains the technical basis. The decision does **not** mean Logto was evaluated or found technically unsuitable (section 3.2 stands: Logto is untested) |
| `F2.1.5` and the dependency chain | `F2.1.5` is **not** completed and `F2.1.4` stays deferred. No `F2` task is marked complete. The chain `F0.1.5` on `F2.1.5` on `F2.1.4` is **not rewritten**; it stays recorded for historical traceability. AJ approved a specific exception on 2026-11-05 under which `F0.1.5` is closed without completing either (next row); the exception does not retrospectively complete them |
| **D2: session policy** | **Approved by AJ on 2026-11-05 at policy level, with technical values delegated to design.** Recorded in `docs/f5-decision-register.md` section 2.7. (1) **Product sessions:** a product session must not outlive the identity-provider session; Account and product lifetimes are finalised in the relevant technical design. (2) **Session expiry:** idle expiry and absolute expiry must both be defined; exact durations and renewal behaviour are delegated to the technical design. (3) **Provider outage:** AJ confirms the proposed **24-hour** extension for existing sessions during ordinary identity-provider outages; **no new logins** during an outage. (4) **Fresh authentication** is required for sensitive actions, particularly starting and cancelling ownership transfers; the exact time window is delegated to technical design. (5) **Token lifetimes** (ID, access, refresh) are delegated to `F4.2.2` and the relevant integration design, including `F8.1.3`, within the approved security boundaries. **No numeric value is set** |
| D2 existing constraints | Cross-referenced, not newly approved: no cookie cache initially; revocation within the existing five-minute bound; RP-initiated and back-channel logout required; user-level revoke and "sign out everywhere" required; identity database restoration invalidates provider sessions; break-glass authority for the Business Admin **remains open under Decision M** (sections 2 and 6.1) |
| **F0.1.5: Gate B-2 closure** | **Closed by explicit AJ exception on 2026-11-05**, based on D1 (Better Auth) and D2 (policy approved, values delegated to design) being decided, **without completing `F2.1.4` or `F2.1.5`**. Recorded in `docs/f5-decision-register.md` section 2.7. The Foundation Plan's task tables have no separate status field, so no roadmap field was changed |
| Limits | This is a documentation record, not implementation approval. Closing `F0.1.5` does **not**: authorise `F3.1.2` implementation (it must still be reviewed against its own dependencies and approval requirements); authorise `F3.2.1` or any other `F3.2` task; satisfy any of the five C16 prerequisites; complete `F2.1.4` or `F2.1.5`; rewrite the original dependency chain; resolve O-F421, Decision M, C7 or any other open question; or authorise any change to Caterly. No `F4` task (including `F4.2.2`) or `F8.1.3` is completed or authorised. The conditions in section 5 item 4 are carried as written; these decisions do not separately confirm or amend them |

## 0. How to read this document

| Marker | Meaning |
|---|---|
| **Approved** | A decision AJ has approved or recorded, with its source |
| **Plan-proposed** | Wording in the Foundation Plan that proposes a value or approach; not an approval |
| **Evidence** | A result from the identity spike (scratch only), with its source and PASS / FAIL / NOT TESTED |
| **Recommendation** | This review's reading of the evidence, for AJ to accept, change or reject |
| **Open** | Unresolved. No answer is assumed |

Sources read for this review: `docs/platform-foundation-plan.md` (Revision 10 with the Revision 11 annotations), `docs/identity-spike-results.md`, `docs/identity-spike-remediation-checklist.md`, `docs/identity-spike-remediation-results.md`, `docs/identity-spike-followup-report.md`, `docs/identity-spike-next-validation-report.md`, `docs/identity-spike-review-followup-report.md`, `docs/platform-audit.md`, `.claude/HANDOVER-2026-11-02.md`, and the repository files `src/lib/auth/auth.ts` and `apps/platform/` (read only). The spike code lives in a scratch folder outside the repository and was not re-read; every spike result below is quoted from the reports.

## 1. What Gate B-2 requires

| Item | Source | Class |
|---|---|---|
| Gate B-2 = **D1** identity provider and **D2** session lifetimes and outage extension ("proposed 24 h"). It is needed before `F3.1.2`, `F4` and "anything provider-specific" | Plan Part 3 section 2 | Approved structure |
| `F0.1.5` Gate B-2 closure: "Close D1, D2"; depends on `F2.1.5` (report and recommendation); done when "Provider chosen" | Plan Part 3 section 6 | Approved structure |
| `F2.1.5` depends on `F2.1.4` (Logto comparison), which needs **E1** (a Logto Cloud dev tenant from AJ). **E1 has not been given** and `F2.1.4` has not started. As the plan is written, `F0.1.5` (Gate B-2 closure) depends on `F2.1.5`, and `F2.1.5` on `F2.1.4`, so Gate B-2 closes through the full spike chain | Plan; spike reports | Open |
| **Exception rule.** Deciding D1 for Better Auth without completing `F2.1.4` would be an exception to the plan as written. It needs AJ's **explicit approval of the exception**. It would not by itself make `F2.1.4` or `F2.1.5` complete, would not change the roadmap dependency (`F0.1.5` on `F2.1.5` on `F2.1.4`) and would not change any acceptance status. Any change to a dependency or an acceptance status needs a **separate explicit AJ approval**, and the Foundation Plan is not amended by this document or by that exception. A provider decision is recorded as a distinct decision, not as completion of the original spike tasks | This review; plan Part 3 section 6 | Rule for AJ's approval |
| D1 is to be decided "on spike evidence"; D2 "Keep proposed" is the plan's own suggestion | Plan Part 2 section E | Plan-proposed |
| Decision rule: if any of discovery, PKCE, back-channel logout or custom claims fails, the Better Auth route is closed and the Logto result decides | Plan Part 1 section 1 | Approved rule |
| Platform Core owns the `users` table in both provider cases; the identity provider holds credentials only. So `F3.1.1`, `F3.2` and `F3.3` do not depend on D1 | Plan Part 3 section 6 (F3.1.1), Part 3 section 0 | Approved structure |
| `F3.1.2` (provider-dependent) and all of `F4` wait for D1 and D2 | Plan | Approved structure |

## 2. Existing approved decisions and standing requirements relevant to D1 and D2

| Decision or requirement | Source | Class |
|---|---|---|
| D8: one `apps/platform` app serving `auth.localhost`, `account.localhost`, `store.localhost`; D14: local ports and `*.localhost` convention (Platform on 3300) | Plan Gate A | Approved |
| Session cookies are host-only: nothing sets a cookie `Domain` | Plan `F1.1.1`; `apps/platform/src/lib/routing/hosts.ts` | Approved / implemented |
| Account is a first-party OIDC client (`F7.1.1`); Caterly is a relying party via `generic-oauth` linked by `sub`, never by email (`F8.1.1`) | Plan | Approved structure |
| Fresh authentication is required to start and to cancel an ownership transfer; declining needs only a normal authenticated session | C14 (A-R) | Approved |
| No cookie cache for products initially (immediate session revocation, one extra query per check) | AJ decision, follow-up report status table item 2 | Approved (recorded in the report) |
| Layered revocation (provider back-channel logout, durable outbox, recovery pull, monitoring) accepted in principle; per-session (`sid`) mapping required for M1; generation/epoch approach accepted for restore | AJ decisions, `.claude/HANDOVER-2026-11-02.md` item 7 | Approved in principle |
| Staff provisioning approved as a design with safeguards; no cookie cache; superuser bypass is an infrastructure trust boundary | Same | Approved in principle |
| The 24-hour continuation applies to **ordinary identity-provider outages only**, not to identity database recovery | AJ decision 5, review follow-up report section 14 | Approved (scope) |
| Identity database restore invalidates all provider sessions (everyone signs in again). Existing Caterly sessions at the first identity migration: forced re-authentication, no automatic mapping by email or user id | AJ decisions 6, handover | Approved |
| Losing membership changes made after a backup is **not acceptable**; recovery source must survive restoration; two-person authorisation for identity-database recovery | AJ decisions 3 and 4 | Approved |
| Audit-export outage: durable outbox, configurable thresholds, **no production thresholds invented** | AJ decision 1 | Approved; thresholds Open |
| No Platform or Ops authentication change, no Caterly identity integration, no Better Auth upgrade in the main repository without separate approval | Spike handover standing rules; release process | Approved restriction |
| Local first: local, then staging, then production, each needing AJ's written approval | Plan Part 1 section 15 | Approved |
| Break-glass: off by default, 4-hour self-expiry, 60-minute sessions limited to Orders, Kitchen, Menus | Plan Part 1 section 10 | Plan wording (Approved as part of the plan); who may use it is Open (Decision M, plan Revision 11 note R11-7) |

## 3. Evidence gathered

All results are from scratch projects, scratch databases or a scratch copy of Caterly. Nothing ran in the main application, staging or production.

### 3.1 Better Auth (self-hosted OIDC provider, `better-auth` 1.7.15 with `@better-auth/oauth-provider`)

| Area | Result | Source |
|---|---|---|
| The four plan hard-stop checks (discovery, PKCE, back-channel logout, custom claims) | **All PASS**, so the Better Auth route is not closed | `identity-spike-results.md` summary |
| Provider checklist (F2.1.1) | 39 of 40 PASS; the failure is K3 (the API refuses `http` redirect URIs, even `*.localhost`; workaround: seed the client table or run local HTTPS) | Same |
| Rate limiting | 4 of 5 PASS; S4 (forged `X-Forwarded-For` dodges the limit) was FAIL, then PASS behind an emulated header-overwriting proxy; real Nginx NOT TESTED | Same; remediation results |
| Existing passwords and ids (F2.1.2) | 8 of 9 PASS: 27 of 27 known-password Caterly accounts sign in unchanged on 1.7.15; `sub` equals the existing `User.id` for 12 of 12 migrated users; the 1 NOT TESTED is Logto import | `identity-spike-results.md` |
| SSO, logout, token validation across two hosts (F2.1.3) | 20 of 22 PASS; Y4 (cached session survives back-channel logout) and Y7 (SQL deletion of provider sessions tells nobody) were FAIL and were then addressed (below) | Same |
| Session cache | Measured: no cache = immediate revocation, 2 queries per check; short maxAge leaves a stated delay | Remediation results section 3 |
| Revocation design | Layered mechanism built and tested in scratch: durable-delivery suite 23 of 23; mechanism suite 7 of 8 (the failure records that a database superuser can bypass the guard: detection, not prevention); per-session mapping 8 of 8; guard enforcement 11 of 11; recovery suites 18 of 18, 12 of 12 and others | Follow-up, next-validation and review follow-up reports |
| Next.js 16.4.3 production build and production mode over HTTPS | 10 of 10 PASS; dev-mode parity with the Node handler 62 of 62 | Follow-up report section 4.3 |
| Caterly on 1.7.15 (scratch copy) | Typecheck, lint, Vitest 1774 of 1775 (the one failure is environmental, identical on 1.7.4), and 27 of 27 across 9 Playwright spec files; org switcher and ownership transfer do not exist in Caterly (NOT TESTED) | Next-validation report task 4 |
| Gaps versus a hosted provider | No hosted login or consent UI (G1), no audit trail (G4), no admin console (G5): all "not provided", so they must be built or operated. MFA (G2) and social login (G3) NOT TESTED | `identity-spike-results.md` |
| Not covered | Real browsers and multi-device (cookie jars only), real Nginx/Cloudflare, hosted PostgreSQL, the real retry schedule, load, production cookie behaviour on a real domain | Reports; handover |

### 3.2 Logto Cloud

**Nothing has been tested.** F2.1.4, the password-import test (I4), and the comparison items G2, G3 and G6 are all NOT TESTED because E1 (a Logto tenant) has not been given. No pricing, India data-residency, branding, MFA, admin console or hash-import evidence exists anywhere in the repository. This review states no fact about Logto beyond what the plan lists as the things to check.

### 3.3 Other providers

The plan names two options only. No other provider (for example a self-hosted Keycloak, Ory or Zitadel, or another hosted service) has been evaluated, and none is proposed here.

## 4. Provider comparison against Platterly's requirements

"Evidence" is what the spike actually demonstrated. "Not evidenced" means no test exists, not that the answer is unfavourable.

| Requirement | Better Auth (self-hosted) | Logto Cloud |
|---|---|---|
| First-party Account application (OIDC client, `F7.1.1`) | Evidenced: authorization code with PKCE, exact redirect match, refresh rotation and theft detection, `prompt=none`, `max_age` step-up (needed for C14), first-party skip-consent. The login and consent pages must be built by us (G1) | Not evidenced |
| OIDC integration for products and Caterly | Evidenced: discovery, JWKS with key rotation, token validation matrix, back-channel and RP-initiated logout, forged-token refusal | Not evidenced |
| Caterly integration | Evidenced: same library family as Caterly (1.7.4 today); 27 of 27 specs on 1.7.15 in a scratch copy; passwords hash-compatible; `sub` = existing `User.id`. A bump of Caterly to 1.7.15 is a separate phase needing its own approval | Not evidenced; password import into Logto is NOT TESTED (I4). If unsupported, existing users would need a reset |
| Future products (Rivo, stub) | Evidenced for two scratch relying parties; client registry is staff-only once `clientPrivileges` is set (set it in production) | Not evidenced |
| Local development at `account.localhost` | Runs fully locally, no external account. K3: the client API refuses `http` redirect URIs, so local clients are seeded in the table or run over local HTTPS (a guarded workaround passed) | Needs a tenant and network access; redirect-URI handling for `http://*.localhost` NOT TESTED |
| Production deployment | Next.js 16 production build and HTTPS mode PASS; we run and patch it on our own server. S4 and the discovery route (finding 8) need care. Real Nginx NOT TESTED | Hosted by the vendor; hosting, residency and availability not evidenced |
| User sessions and logout | Evidenced including single logout, user-wide revoke, business-scoped removal, restore behaviour. The revocation architecture is ours to run and monitor | Not evidenced |
| Security and account recovery | Rate limiting, brute-force guard and OTP/password flows exist; email OTP used by Caterly today. MFA exists as a plugin but is NOT TESTED. Staff provisioning, audit trail and monitoring must be built (design approved, not built) | Hosted MFA, audit and admin console are the plan's reasons to compare; NOT TESTED |
| Operational complexity and maintenance | Highest ownership: we own login UI, consent, audit trail, admin tooling, key custody, backups and restore procedure, upgrades (the spike produced a substantial recovery design for this) | Lower ownership of the identity service itself, with a recurring vendor cost and dependency that has not been priced or checked |

## 5. Recommendation for AJ's consideration

This is a reading of the evidence, not a decision.

1. **The evidence supports Better Auth as a technically viable choice.** It passed every hard-stop the plan set, keeps existing passwords and ids unchanged, matches the library Caterly already runs, works fully offline for local development, and has an extensive tested revocation and recovery design.
2. **The evidence does not support a comparative claim.** There is no Logto data, so "Better Auth is better" cannot be shown, only "Better Auth is sufficient". Its cost is real: the login and consent screens (which `F4.1.1` already plans to build in the Platterly design system), an audit trail, a staff client-registry tool and admin console, and the operational procedures the spike designed.
3. **Two ways forward.** Option B follows the plan as written. Option A departs from it and is possible only as an explicit exception approved by AJ (section 1):
   - **Option A: decide D1 now for Better Auth**, with AJ explicitly approving the exception that `F2.1.4` (Logto comparison) is waived or deferred. Fastest route to a real sign-in. Logto stays a documented alternative, not pursued. Consequences: `F2.1.4` and `F2.1.5` are **not** marked complete by this decision; the dependency chain `F0.1.5` on `F2.1.5` on `F2.1.4` is **not** rewritten; whether `F0.1.5` may close while `F2.1.5` is not complete, or whether the chain is amended, is a separate explicit AJ approval; the provider choice is recorded as its own decision.
   - **Option B: grant E1 and run `F2.1.4` first**, then decide on a scored comparison, as the plan intends. Slower, and it needs a Logto tenant and AJ's time.
4. **If Option A, these should be explicit conditions of the decision** (in addition to the exception approval above) (each is already in the reports, not new): production staff provisioning needs AJ's approval of the documented process; `clientPrivileges` set to staff only; forwarded-address handling verified on real Nginx at staging; the Caterly bump to 1.7.15 handled as its own approved phase; real-browser testing before any production use.

**Recommendation:** Option A is supportable on the evidence if AJ is content to defer the Logto comparison and approves the exception; otherwise Option B. The choice between them turns on AJ's tolerance for the build-and-operate burden and the unpriced vendor alternative, which the repository cannot settle.

## 6. D2: session policy

### 6.1 What is already specified

| Item | Value or rule | Class |
|---|---|---|
| Outage extension | Existing sessions keep working through an identity-provider outage; local sessions renew locally for at most **24 hours** without the provider, then require it | Plan-proposed (D2 "proposed 24 h"); scope limited to ordinary outages by AJ (Approved) |
| New logins during an outage | Blocked; no local password login after cutover | Plan |
| Break-glass | 4-hour self-expiring flag; 60-minute sessions; Orders/Kitchen/Menus only | Plan |
| Cookie cache | None initially; revocation takes effect on the next request | Approved |
| Revocation bound | Membership-version pull bound of **5 minutes** (the ceiling for any product-side cache) | Plan design |
| Logout | RP-initiated plus back-channel to registered clients; user-level revoke ("sign out everywhere") | Plan (`F4.2.3`, `F4.3.1`) |
| Fresh authentication | Required to start and cancel an ownership transfer (`max_age`); window length not stated | C14 (Approved); value Open |
| Restore | Identity database restore invalidates all provider sessions | Approved |

### 6.2 What is not specified

| Question | State |
|---|---|
| **Product session lifetime** (how long a signed-in Account or product session lasts) | **Open.** The plan names it in D2 but gives no value. Evidence only shows Better Auth's default: the spike's cookies carried `Max-Age=604800` (7 days) with default settings. Caterly's `src/lib/auth/auth.ts` sets no explicit session block, so it appears to use the library default; this should be confirmed rather than assumed |
| **Identity-provider (OP) session lifetime** | **Open** |
| Idle timeout versus absolute lifetime; sliding renewal; "remember me" | **Open** |
| ID, access and refresh token lifetimes | **Open.** Tests used 6-second tokens to prove expiry behaviour only. Product sessions are independent of token lifetime (V5), so revocation relies on logout and the membership pull, not token expiry |
| Length of the fresh-authentication window for sensitive actions | **Open** (mechanism proven: `max_age=0`, `max_age=2` after 3.5 s forces login, `max_age=3600` passes) |
| Whether the 24-hour outage extension is the value AJ wants | **Plan-proposed, not formally closed** |
| Whether Account sessions and product sessions share a lifetime | **Open** |
| Break-glass authority for the Business Admin | **Open** (Decision M) |

### 6.3 Trade-offs

| Dimension | Longer / more permissive | Shorter / stricter |
|---|---|---|
| Session length | Fewer sign-ins for kitchen staff who use Caterly all day; longer exposure if a device is lost | More friction; smaller exposure window |
| Idle versus absolute | Absolute-only is simple; sliding keeps active users in but extends stolen-session life | Idle timeout limits unattended devices; needs clear UX on shared kitchen devices |
| Outage extension | Longer keeps kitchens working through provider downtime; longer window with no revocation check | Shorter reduces unchecked exposure; risks interrupting live service during an outage |
| Fresh-auth window | Longer means fewer prompts for ownership actions | Shorter is safer for handover actions (C14) |
| Cache | No cache costs one extra query per request but gives immediate revocation (measured 2 ms propagation); a cache of maxAge N leaves up to N seconds of stale access | |
| Product versus provider lifetime | A long provider session with a shorter product session gives easy re-entry; the reverse forces repeated credential prompts | |

No numeric recommendation is made, because the repository holds no usage data (session length of kitchen staff, devices, shared tablets) on which to base one.

## 7. Assumptions and unanswered questions that prevent a safe decision

| # | Item | Why it matters |
|---|---|---|
| 1 | Logto has no evidence at all (E1 not given) | Prevents any comparative D1 |
| 2 | Whether AJ will waive or defer `F2.1.4` | Decides Option A versus B |
| 3 | The cost of building and operating login, consent, audit and admin tooling is unestimated | The repository supports no figure |
| 4 | India data residency and vendor terms for a hosted provider are unchecked | Relevant only if Logto stays an option |
| 5 | Real-browser, multi-device, real Nginx/Cloudflare and hosted-database behaviour untested | Needed before any staging or production use, not before choosing |
| 6 | Production thresholds for the audit outbox; named owners for the monitor key, baseline, audit sink, access journal and operator list; which other organisation changes are journaled in M1; whether a second completeness witness is required; handling of a partitioned product at recovery | Open items 1 to 5 of the review follow-up report section 23. Not needed to choose D1, but needed before the revocation architecture goes beyond scratch |
| 7 | Production staff-provisioning tool and approval of the documented process | Required before client creation is enabled |
| 8 | Product session, provider session, idle and fresh-auth values (section 6.2) | D2 cannot close without them |
| 9 | Whether existing Caterly specs beyond the 9 spec files run on 1.7.15 | Matters for the later Caterly bump |
| 10 | The relation of `F4.2.1` to the staff identity link and permission design (O-F421) and of Decision M to break-glass | Affects staff sign-in and break-glass design, not D1 |

## 8. Exact decisions AJ needs to make

| # | Decision | Options | Status |
|---|---|---|---|
| **D1-a** | Identity provider | (A) Better Auth now; (B) grant E1 and run `F2.1.4` first; (C) another option, which would need new evidence | **Decided 2026-11-05: (A) Better Auth.** See the Decision record |
| **D1-b** | If A: explicit approval of the exception to the plan (`F2.1.4` waived or deferred), with the understanding that `F2.1.4` and `F2.1.5` stay not complete and that any change to the dependency chain or acceptance status is a separate approval; plus the conditions in section 5 item 4 | Approve / amend / reject | **Exception approved 2026-11-05** (`F2.1.4` deferred; `F2.1.5` not completed). The section 5 item 4 conditions are not separately confirmed or amended by this decision |
| **D2-a** | Product session lifetime (and whether Account differs) | AJ to state, or keep Better Auth's default after it is confirmed | **Policy approved 2026-11-05:** a product session must not outlive the identity-provider session. Account and product lifetimes delegated to technical design; no value set |
| **D2-b** | Provider session lifetime, idle versus absolute, sliding or fixed | AJ to state | **Policy approved 2026-11-05:** idle expiry and absolute expiry must both be defined. Exact durations and renewal behaviour delegated to technical design; no value set |
| **D2-c** | Outage extension: confirm 24 hours or choose another value | Confirm / change | **Confirmed 2026-11-05:** 24 hours for existing sessions during ordinary identity-provider outages; no new logins during an outage |
| **D2-d** | Fresh-authentication window for sensitive actions | AJ to state | **Policy approved 2026-11-05:** fresh authentication is required for sensitive actions, particularly starting and cancelling ownership transfers. The exact window is delegated to technical design |
| **D2-e** | Token lifetimes (ID, access, refresh) | AJ to state, or delegate to the `F4.2.2` design within stated bounds | **Delegated 2026-11-05** to `F4.2.2` and the relevant integration design, including `F8.1.3`, within the approved security boundaries; no value set |
| **G-B2** | Close `F0.1.5` (Gate B-2) without completing `F2.1.4` or `F2.1.5` | Approve the exception / require the plan chain | **Exception approved 2026-11-05.** `F0.1.5` closed by AJ's explicit exception; `F2.1.4` deferred; `F2.1.5` not complete; original dependencies unchanged |

D2-b to D2-e can be decided with a smaller step: AJ approves the dimensions and bounds (for example "product session no longer than the provider session; revocation never slower than the 5-minute bound") and leaves exact numbers to the `F4.2.2` and `F8.1.3` design, to be approved there. That choice is also AJ's.

## 9. Dependencies and consequences

| Area | If D1 and D2 are decided (this clears the provider and session-policy gate only) | If they are not |
|---|---|---|
| **F3** | `F3.1.2` (provider-dependent identity link) is no longer held back by Gate B-2, which AJ closed by exception on 2026-11-05. That does **not** authorise `F3.1.2` implementation: it must still be reviewed against its own dependencies (`F3.1.1`, which is accepted in stages and not marked complete as a whole, and `F0.1.5`) and its own approval requirements. `F3.2.x` is independent of D1 but is gated by the C16 prerequisites | `F3.1.2` stays blocked by Gate B-2 |
| **F4** | Gate B-2 no longer holds back `F4`, but **no F4 task is thereby complete or authorised**. Each task keeps its own dependencies and design requirements, from the Foundation Plan (Part 2 task rows; Part 3 adds `F0.1.5` to `F4.1.1`): `F4.1.1` on `F3.1.2`, `F1.1.3` and `F0.1.5`; `F4.1.2` on `F4.1.1`; `F4.1.3` on `F4.1.1` and `F2.1.5`; `F4.2.1` on `F4.1.1`; `F4.2.2` on `F4.2.1` and `F1.2.1`; `F4.2.3` on `F4.2.1`; `F4.3.1` on `F4.2.3`; `F4.3.2` on `F4.2.1`. `F4.1.3` depends on `F2.1.5`: choosing Better Auth under Option A does **not** complete `F2.1.5` and does **not** remove that dependency (section 1, exception rule); any change to it needs a separate explicit AJ approval. `F4.2.1` also carries the unresolved staff identity link, permission storage and staff fresh-authentication questions (**O-F421 stays open**). For Better Auth the work adds `better-auth` ≥1.7.15 and the oauth-provider package to `apps/platform` (a dependency change needing its own test run), the discovery route, and the auth-host login and consent pages, each needing its own approval | `F4` stays blocked by Gate B-2 |
| **F7** | Individual dependencies from the Foundation Plan: `F7.1.1` on `F4.2.2` and `F1.1.1`; `F7.1.2` on `F7.1.1` and `F4.3.1`; `F7.2.1` on `F3.2.2` and `F7.1.1`; `F7.2.2` on `F5.2.1` and `F5.3.1`; `F7.3.1` on `F6.1.2`; `F7.3.2` on `F6.1.2` and `F8.2.2`. Each of these tasks needs its dependencies built and accepted, not only D1 and D2. Existing gating qualifications still apply where the chain reaches them: `F3.2.2` (for `F7.2.1`) sits behind `F3.2.1` and the C16 gate; `F7.2.2` depends on two F5 tasks that stand differently: `F5.2.1` (depends on `F3.2.2` and `F4.1.1`): central employee invitations are superseded (C5, C6), while the disposition of product-managed invitations and `F5.2.1`'s dependency position remain pending; `F5.3.1` (depends on `F5.1.1`): the transfer rules are reconciled in the C15 amendment proposal, but its listed open dependencies and decisions remain outstanding (the TR-06 nominee-acceptance route, the TR-21 timing of the former Admin's choice, the TR-22 count check, and the initiating-role question under Decision M). "Revision 11" is the working title of that amendment proposal; it is not an approved or operative Foundation Plan revision; `F6.1.2` (for `F7.3.x`) sits behind `F6.1.1` and `F3.2.1`; `F8.2.2` (for `F7.3.2`) is a Caterly-side task. A first sign-in at `account.localhost` needs `F7.1.1` and so `F4.2.2` and its chain; a working profile and security page (`F7.1.2`) additionally needs `F4.3.1` | The Account stays a prototype |
| **F8 / Caterly** | `F8.1.1` to `F8.1.3` are no longer held back by D1 and D2 alone; they also depend on `F4.2.2`, `F6.3.1` and `F4.2.3`. A Caterly bump to better-auth 1.7.15 is a separate approved phase | Caterly integration cannot start |
| **Local development** | For Better Auth, `account.localhost:3300` needs the client seeded (K3) and the discovery route; the mail sink (3600) can carry OTP email | A hosted provider needs a tenant (E1) and network access |
| **Not changed by D1 and D2** | `F4` task completion or authorisation; `F2.1.4` and `F2.1.5` completion (the `F0.1.5` closure came from AJ's separate exception, not from D1 and D2); O-F421 and the staff identity-link and permission design; the C16 gate, `F3.2.1`, Decision M, C7 and every other open ownership question | Same |

**Scope of the D1/D2 gate.** Deciding D1 and D2 resolves the identity-provider and session-policy decision gate and nothing else. It does not mark any F4 task complete, does not authorise any F4 task, and does not settle other open design questions such as O-F421 or the staff identity-link and permission model. Each F4 task still needs its own dependencies met and, where the plan or AJ's standing rules require it, its own approval. `F0.1.5` was closed on 2026-11-05 by AJ's separate explicit exception; the statuses of `F2.1.4` (deferred) and `F2.1.5` (not complete) are unchanged and are changed only by a separate explicit AJ approval.

## 10. What this document does not do

It does not choose D1 or D2, record a decision, edit the Foundation Plan or any register, change code or configuration, start a database or service, or contact any provider. Acting on any decision needs AJ's separate, explicit approval. `F3.2.1` remains unauthorised.
