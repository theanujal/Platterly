# Gate B-1 decision record (F0.1.4)

Recorded 2026-11-04 from AJ's approval. The plan is `docs/platform-foundation-plan.md` (Revision 10 change log, section 0i; new section 3b). **Documentation only: nothing here changes code, schema, environment or credentials, and no implementation has started.**

## Status
| Decision | Status | AJ's decision | Blocks (W1) |
|---|---|---|---|
| D3 Central roles and Account permissions | **Approved** | Owner, Admin, Manager, Member kept. Fresh authentication for every Owner-only action | `F3.2.3`, `F5.2.1`, `F7.2.2` |
| D4 Central business locations | **Approved** | Product-owned. Branch, Kitchen and Store stay inside their products | `F3.2.1` |
| D5 Auth email sender and templates | **Open** | Not decided. Recommendation unchanged: same ZeptoMail account, distinct sender | `F4.1.1` only (not the data layer) |
| D7 Product registry | **Approved** | Ops authoritative; Platform Core caches and refreshes | `F6.1.1`, `F6.1.3` |
| D13 Ownership flows O1 to O4 | **Approved, amended** | One account per product per identity enforced across creation, claims, transfers and invitations. O4 stays blocked on E2 | `F5.1.0`, `F5.1.1`, `F5.3.1`, `F9.1.2`; `F10.1.1` (O4) |
| D15 One membership per user per product (new) | **Approved** | Strict: all roles, staff included; database-level; no multi-kitchen switcher; second kitchen needs another email | `F3.2.1`, `F3.2.2`, `F5.x`, `F7.2.1` |
| Scope S2 and `F8.3.2` (organisation switcher) | **Removed** | All multi-kitchen switcher and multi-business dashboard assumptions removed | none now |

`F0.1.4` is **partly closed**: D5 is open and O4 waits for E2.

## D15 rule
One email is one Platterly identity. It holds at most one membership, in any role, per product (one Caterly and one Rivo is allowed). A second kitchen in a product needs a different email. No switcher, no multi-business list.

Required enforcement (plan section 3b):
| Requirement | How |
|---|---|
| Database level, staff included | `membership_product_slots` with `UNIQUE (user_id, product_key)`, written in the same transaction as the membership and the product link |
| Concurrent membership creation | Shared `lockOrganisation` plus the unique index as backstop |
| Duplicate invitations | One pending invitation per (organisation, `lower(email)`); refused at send and accept for an identity that already has a slot; competing invitations for the same product are superseded when one is accepted |
| Flows | O1 refuses; O2 refuses at issue and consume; O3 target must be free; I1 and I2 follow the invitation rule; migration reports and stops on a conflict (M-03) |
| Case | `lower(email)` unique index |

## Boundaries kept
| Boundary | State |
|---|---|
| Caterly login, kitchen settings, memberships, live operations | Unchanged. Caterly-side enforcement and closing the self-service organisation-create route belong to the Caterly integration (`F8`), a final, separately approved activity |
| Existing Caterly integration and migration | Final, separately approved activity |
| W1 implementation | Not started |

## Evidence (read-only, 2026-11-04, `platterly_dev`)
64 users; 0 with more than one membership; 0 with more than one owner membership; 0 case-insensitive email duplicates. The 3 migrating customers need E2.

## Remaining blockers
| Blocker | Affects |
|---|---|
| D5 open | `F4.1.1` |
| D1 and D2 (Gate B-2, needs the spike and E1) | `F3.1.2`, all of F4, `F5.1.1` consumption |
| E1 Logto dev tenant | `F2.1.4` |
| E2 old-system access | `F0.1.2`, O4, `F10.1.1` |
| `F5.1.0` spec must settle the section 3b open questions (cooling-off, lock-out recovery, refusal message) | `F5.1.1`, `F5.3.1` |
| `F6.1.0` review and the first real secret rotate (AJ) | `F6.1.3` |
| Everything uncommitted; no commit or push without AJ's approval | `F1.3.2` CI |
