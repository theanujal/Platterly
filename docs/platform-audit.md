# Platform audit record (F0.1.1)

Written 2026-11-01 from the code as it stands, before any platform work. It supports `docs/platform-foundation-plan.md` (Revision 9). Nothing here changes code.

## 1. Authentication (catering app)
| Topic | Finding | Where |
|---|---|---|
| Library | Better Auth `^1.7.4` with the `organization` and `emailOTP` plugins and the Prisma adapter. It is not custom auth | `src/lib/auth/auth.ts` |
| Strategies | Email and password, plus a 6-digit email OTP (10 minutes). No social login, no 2FA | `auth.ts` |
| Cookies | Host-only, `httpOnly`, `sameSite: lax`, `Secure` in production. `crossSubDomainCookies` is deliberately off | `auth.ts` (`advanced`) |
| Trusted origins | Built from the host list | `src/lib/routing/hosts.ts` (`trustedOrigins`) |
| Rate limit | Per client IP from `cf-connecting-ip` / `x-forwarded-for`; off only for the e2e rehearsal | `auth.ts` |
| OIDC provider | The installed `better-auth` 1.7.4 has no provider plugin. `@better-auth/oauth-provider` exists but needs a newer `better-auth`. Unproven; covered by the identity spike | plan, Gate B-2 |

## 2. Organisation and membership
| Topic | Finding | Where |
|---|---|---|
| Tenant | A Better Auth `organization` is the project's `Tenant`. `Organization.businessId` (`biz_<32hex>`) exists in catering and Ops and is the join key of the Ops contract | `prisma/schema.prisma`, `packages/contract/src/ids.ts` |
| Active organisation | The session holds one `activeOrganizationId` | `src/lib/auth/require-session.ts` |
| Fallback pick | When there is none, `requireActiveOrganization` takes `member.findFirst` with no `orderBy`, so a user in several organisations gets an unspecified one | `require-session.ts` (the `else` branch) |
| Member uniqueness | `Member` has no unique `(userId, organizationId)` | schema; audited by `F8.2.3a` |
| Member writers | `auto-provision.ts`, invitation accept (Better Auth), `src/modules/team/team.ts`, `updateMemberRoleAction` | grep |
| Disabled member | `Member.disabledAt` is checked in the one central function | `require-session.ts` |

## 3. Onboarding and provisioning
| Topic | Finding |
|---|---|
| Sign-up | `databaseHooks.user.create.after` calls `provisionTenantForNewUser`, which creates an organisation, a `Member` and an audit row in one transaction (`src/modules/tenants/auto-provision.ts`). It checks only for a pending invitation |
| Ops provisioning gap | `business.provision` from Ops (`src/modules/ops-link/commands.ts`) creates an organisation with no user. The owner's later sign-up then creates a second organisation |
| Self-heal | `requireActiveOrganization` calls the same provisioning when a signed-in user has no membership |

## 4. Hosts and routing
| Topic | Finding |
|---|---|
| Host kinds | `src/proxy.ts` splits one app by host with `hostKind` (`src/lib/routing/hosts.ts`). Unknown or bare hosts serve no page and answer 404. `/api/health` and the signed `/api/ops/*` answer on any host |
| Apps | Catering (`src`, port 3000), Ops (`apps/ops`, 3200), marketing site (`apps/site`, 3100). Ops is its own app and database, linked only by `packages/contract` and signed HMAC calls (`docs/ops-contract.md`) |

## 5. Ops (billing and entitlements)
| Present | Missing |
|---|---|
| Plans, subscriptions, Razorpay (including auto-pay), GST invoices, entitlement snapshots, signed contract | Coupons, bundles, add-ons, billing-customer record, mandates. `PAST_DUE` is never set. Catering-specific constants are hard-coded in `apps/ops/src/modules/plans/plans.ts` and `site-content/site-content.ts` |

## 6. Deploy and environments
| Topic | Finding |
|---|---|
| Scripts | `deploy/bin` (deploy, rollback, backup, restore drill, slot runner), `deploy/nginx/platterly.conf`, `deploy/systemd` units, `scripts/backup-db.sh` |
| Staging | None exists. The deploy scripts have never run on a real server. There is no live environment (go-live is later) |

## 7. Tests
| Topic | Finding |
|---|---|
| E2E coupling | 70 of 72 spec files call `signUpCaterer` (`e2e/auth-helpers.ts`), which drives the real `/kitchenlogin` sign-up form and email OTP. Any change to the sign-in flow touches nearly the whole suite |
| Rule | Never run the full suite; one spec at a time (RULES.md 7 and 8) |

## 8. Consequences for the plan
1. Central identity must keep catering's `businessId` and `Member` rows stable; they are the migration anchor.
2. The Member duplicate audit (`F8.2.3a`) must finish before any unique index.
3. The Ops provisioning gap (section 3) has to be closed by the account-ownership flow (decision D13).
4. Test helpers (`signUpCaterer`) need one replacement path before the sign-in flow changes.

## 9. Member duplicate audit (F8.2.3a), run 2026-11-01
Read-only (`default_transaction_read_only = on`) on the local dev database `platterly_dev`, query `GROUP BY userId, organizationId HAVING count(*) > 1`.

| Measure | Result |
|---|---|
| Member rows | 43 |
| Distinct (userId, organizationId) pairs | 43 |
| Duplicate pairs | 0 |

No data was changed. Output kept at `/private/tmp/claude-501/-Users-aj-Downloads-ASK-Net-My-Stuff-Claude-Platterly/cb904566-5b08-45a0-9688-17538e210dc7/scratchpad/member-audit.txt`. This covers the dev database only; the old-system customers and any staging or production data are audited later (`F8.2.3f`, `F8.2.3g`).

## 10. Acceptance (added 2026-11-04; sections 1 to 9 above are unchanged)
**Status: Accepted with notes** (AJ, 2026-11-04). The findings above stand as written. The notes below are follow-ups, not corrections; none has been applied to sections 1 to 9. They are to be made later as dated amendments.

| # | Follow-up | Status |
|---|---|---|
| 1 | Model coverage is incomplete: add `User`, `Session`, `Account`, `Verification`, `Invitation`, and the `Branch`, `Kitchen` and `Store` hierarchy (the schema has 88 models) | Open |
| 2 | Host-to-product mapping is not recorded: add `PRODUCT_SUBDOMAINS` in `src/lib/routing/hosts.ts` to section 4 | Open |
| 3 | Deployment scope, ports and Node version need a note: backup retention differs between `deploy/README.md` (12 monthly copies), `deploy/deploy.conf.example` (365 days) and `deploy/backup.sh` (183 days); README says Node "22 LTS or newer" while CI and the local machine use 24 and Prisma 7.10.1 needs `^20.19 \|\| ^22.12 \|\| >=24`; port 3300 is the site publish hook's server port and the Platform's local port. These map to staging decisions 3, 8 and 10 (still open for production) | Open |
| 4 | Bare filenames need full paths: `auth.ts` (`src/lib/auth/auth.ts`), `auto-provision.ts` (`src/modules/tenants/auto-provision.ts`), `require-session.ts` (`src/lib/auth/require-session.ts`), `site-content/site-content.ts` (`apps/ops/src/modules/site-content/site-content.ts`, to be confirmed when amending) | Open |
| 5 | Section 9 should point to `docs/member-duplicate-audit-results.md`, the rerun on a copy accepted by AJ on 2026-11-04 (43 rows, 43 pairs, 0 duplicates); section 9's own output path is a scratchpad file | Open |
| 6 | `docs/platform-foundation-plan.md` and the 1 Nov handover say "71 of 77" specs; this audit's "70 of 72" is the correct count. The plan and handover are to be corrected, not this audit | Open |
