# Account feature additions: DRAFT PROPOSAL (2026-11-05)

**Status:** Draft. Not accepted. Not part of the approved plan. `docs/platform-foundation-plan.md` is NOT edited. Nothing here is authorised to build. It needs an AJ-approved documentation task before any phase below enters the plan.

**Origin:** A comparison of Zoho Accounts with the Account scope in the plan (F7). AJ approved the additions below on 2026-11-05. Zoho facts come from Zoho's public help pages (search snippets only), not from a full read.

## 1. What the approved plan has today (F7, M1)
| Phase | Scope |
|---|---|
| F7.1.1 | Shell, Account as a first-party login client |
| F7.1.2 | My Profile and Security: sessions, recovery, email change UI |
| F7.2.1 | My Business (one per product, no switcher) |
| F7.2.2 | Members, invitations, role change, owner add/transfer (scope pending, see C5/C6 notes) |
| F7.3.1, F7.3.2 | My Products; Activate Caterly |

## 2. Additions approved by AJ
| # | Addition | AJ decision | Proposed placement | Depends on (from the plan) | Notes |
|---|---|---|---|---|---|
| A1 | Sign-in history (date, time, approximate location, device, success or failure) | Needed. Supports the E-04 mitigation and the audit trail | Security page, new phase after F7.1.2 | F4 (identity service) for the sign-in events; audit design | Needs a sign-in event record. Must not store secrets. Retention period undecided |
| A2 | Trusted devices (list, remove, "trust this device") | Add | Security page | F4; A1 | Interacts with MFA and session rules |
| A3 | Notification preferences | **Required** | New Account page | Notification flows for Platform (none exist yet); a preference model | Which notices are mandatory and cannot be switched off (security, billing, ownership) must be decided |
| A4 | Data export and account deletion | Add | New Account section | F5 ownership rules; audit; D1 | See risks R1 and R2 |
| A5 | Profile photo | Add | Profile page | File storage in Platform (none today) | See risk R3 |
| A6 | MFA for Owners | **Decided: required for Owners** (2026-11-05) | Security page | Login provider decision (D1, F2.1.4); F4 | Reduces E-04 only if enforced at sign-in and at ownership actions |

## 3. Proposed new phases (names and numbers are suggestions)
| Proposed phase | Content | Depends | Milestone |
|---|---|---|---|
| F7.1.3 | Sign-in history page (A1) and trusted devices (A2) | F7.1.2, F4.2.x | M1 |
| F7.1.4 | MFA enrolment and backup codes (A6), if confirmed | F7.1.2, provider decision | M1 |
| F7.1.5 | Notification preferences (A3) | F7.1.1; Platform notification design | M1 |
| F7.1.6 | Profile photo (A5) | F7.1.2; Platform file storage | M1 |
| F7.4.1 | Data export request and account deletion request (A4) | F5 ownership rules; staff process | M1 or later (AJ to decide) |

Complexity and risk ratings are not assigned. They need the dependency work first.

## 4. Risks and conflicts to settle
| ID | Item | Detail |
|---|---|---|
| R1 | Deletion versus "manual delete only" | The 2026-10-12 go-live decision says manual delete only. Proposed reading: a deletion is a request that staff review, not an automatic delete. AJ to confirm |
| R2 | Deletion of a sole Owner | Deleting the account of a sole Owner would leave a business with no Owner. Ties to the open F5.1.0 questions (E-04, E-14, X5, previous-Owner removal). The rule must be settled in F5.1.0 first |
| R3 | Profile photo storage | Platform has no file storage. Files stay on the VPS only (go-live decision). Needs a storage design, size and type limits, and a removal path |
| R4 | MFA cost | MFA, backup codes and trusted devices are cheap or costly depending on whether the identity provider is Logto or our own build (D1, F2.1.4) |
| R5 | Sign-in history privacy | Location and device data is personal data. Retention, who can see it (the user only, or staff in a case, audited like Y2-D) must be decided |
| R6 | Mandatory notices | Security, billing and ownership notices must not be switchable off. Without this, A3 weakens the E-04 mitigation |
| R7 | Export contents | Which data is exported (Platform identity only, or also product data held by Caterly) is undecided. Platform does not hold product data |

## 5. Not adopted (from the Zoho comparison)
| Feature | Reason |
|---|---|
| App passwords | Exist for email clients; Platterly has none |
| Linked social accounts | Not a requirement |
| Language and region preferences | Regional language support is out of scope (PRD §65) |
| Authorised and connected apps | Stays in M3 (F19.2.1) |

## 6. Decisions recorded from AJ (2026-11-05, answered in chat)
| # | Decision | AJ's answer | Effect on this draft |
|---|---|---|---|
| 1 | MFA (A6) | **Required for Owners** (optional for other roles) | A6 is decided. Still depends on the login provider (R4). Enforcement point: before ownership and billing actions |
| 2 | Deletion (R1) | **A request that staff review**; a sole Owner must first transfer ownership or close the business | R1 resolved. R2 still needs the F5.1.0 rule for the sole-Owner case |
| 3 | M1 scope | **All of A1 to A5 are in M1**: sign-in history and trusted devices, notification preferences, profile photo, data export and deletion request | F7.1.3, F7.1.5, F7.1.6 and F7.4.1 are M1 |
| 4 | Mandatory notices (R6) | **Security, ownership and billing notices cannot be switched off**; everything else is switchable (AJ's first answer also ticked "Everything switchable", clarified to this) | R6 resolved |
| 5 | Sign-in history (R5) | **90 days**; the user sees their own; staff only inside an audited case | R5 resolved (same audit idea as Y2-D) |
| 6 | Export scope (R7) | **Platform identity data only**; business data is exported from Caterly's own screens | R7 resolved. No Caterly change |
| 7 | Profile photo storage (R3) | **Platform's own folder on the VPS**: size and type limits, one photo per user, removable | R3 resolved in direction; the storage design is still to be written |

## 7. Still open
| # | Item |
|---|---|
| 1 | Whether to write these into the approved plan through a documentation task (not yet requested) |
| 2 | R2: sole-Owner deletion rule, settled inside F5.1.0 |
| 3 | R4: MFA and trusted-device cost depend on the login provider decision (D1, F2.1.4) |
| 4 | Export and deletion: the exact file format, the review steps for staff, and the time limit for a request |
| 5 | Photo limits (maximum size, allowed types) and whether staff can remove a photo |
| 6 | Trusted-device rules: how long a device stays trusted and what a trusted device may skip (MFA prompt only, or also fresh authentication for ownership actions) |

## 8. New dependencies created by putting all items in M1 (proposed, as of 2026-11-05)
Putting A1 to A6 in M1 means work the approved plan does not yet contain. None of it is authorised. Task names are placeholders, not plan phases.

| Needed by | What must exist first | In the approved plan today? | Where it is likely to land |
|---|---|---|---|
| F7.1.3 sign-in history | The identity service records sign-in events (date, time, approximate location, device, success or failure). 90-day retention with deletion of older entries. Audited staff view inside a case | No | Identity service (F4), audit design |
| F7.1.3 trusted devices | A trusted-device record, remove and expiry rules. Trusted-device rules are open (section 7, item 6) | No | Identity service (F4) |
| F7.1.4 MFA | Enrolment, backup codes, enforcement for Owners before ownership and billing actions. Depends on the login provider (D1, F2.1.4) | No (only a comparison point in F2.1.4) | Identity service (F4), Gate B-2 |
| F7.1.5 notification preferences | A preference model and a Platform notification sender. Security, ownership and billing notices are marked mandatory and cannot be switched off. Everything else is switchable | No (Platform has no notification code today) | Platform Core and identity service |
| F7.1.6 profile photo | File storage in Platform's own folder on the VPS, size and type limits, one photo per user, removal. Limits are open (section 7, item 5) | No | Platform Core |
| F7.4.1 export and deletion request | An export of Platform identity data only. A staff-reviewed deletion request. Sole Owner must first transfer ownership or close the business, so the sole-Owner rule from F5.1.0 is needed first | No | F5.1.0, staff process, audit |

**Effect on the approved plan's order:**
| Point | Effect |
|---|---|
| Gate B-2 (D1, D2, D5) | Still the critical path. MFA, trusted devices and sign-in history all sit on the identity service |
| F5.1.0 | Must settle the sole-Owner deletion rule (R2) before F7.4.1 |
| Wave W4 | The Account stream grows by the phases above. No timing is estimated, because the plan gives none |
| Caterly, Ops and the site | No change. Nothing here touches them. Export covers Platform data only |

**Not yet done:** complexity and risk ratings, test lists, and the schema for sign-in events, trusted devices, preferences and deletion requests. Each needs your approval before design starts.
