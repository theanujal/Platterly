# F5.1.0 decision register

Created 2026-11-05 from AJ's approval of Step 1. **Documentation only.** This file changes no other document, code, schema, migration or Git state, and it authorises no implementation. It does not accept `F5.1.0` and does not authorise `F3.2.1`.

## 0. How to read this register

### Evidence classes
| Code | Meaning |
|---|---|
| **H** | Recorded in a project record: `docs/gate-b1-decision-record.md` (committed), `docs/f5-ownership-flow-spec-draft.md` (Revision 5, sections 0A and 0E; **untracked**), or `.claude/HANDOVER-2026-11-04-f5-ownership-spec.md` (**local only**; `.claude/` is gitignored) |
| **R** | Approved by AJ on 2026-11-05 in the ChatGPT review and relayed to Claude Code in conversation, with the full wording. The wording below is the wording as relayed |
| **R+O** | Relayed on 2026-11-05 as a summary of, or reference to, an earlier approved direction. **The original approval wording and the original approval date are not available in any project record or earlier session.** The wording below is the relayed direction, not the original. 2026-11-05 is the date of the relay, not of the approval |

### Rules for this file
- Wording is recorded as given. Nothing here is inferred, and no approval is invented.
- Where the relayed text is a summary, the entry says so (R+O).
- Recommendations in Revision 5 are not approvals. Only the entries in section 2 are approved.
- The H sources are not all committed. The Revision 5 draft itself describes the 2026-11-04 decisions as "recorded as AJ decisions for review" and not yet written into the approved plan documents. Its status table still says "AJ has not decided any proposal below". The F5 handover lists the same items as "Decided by AJ". AJ has since treated them as authoritative.
- The file is changed only with AJ's approval.

### Numbering (several "C" and "D" series exist; they are different items)
| Label | Meaning | Where |
|---|---|---|
| **R-C1 to R-C4** | The refusal-message decisions that Revision 5 calls "C1 to C4" (section 5.2) | This register |
| **C2 to C16** (plain) | The policy series. It was numbered by Claude in the 2026-11-05 consolidated classification and then adopted in AJ's approvals. Its C1 was the staff-authority question, recorded here as **X4**. C7 is the open Admin-claims item | This register |
| **W1 C1 to C10** | The W1 plan's own approved baseline decisions (AJ, 2026-11-04), for example W1 C7 (O1 links the product) and W1 C8 (a disabled member keeps the slot). **They are unrelated to the policy series with the same numbers** | `docs/w1-implementation-plan.md` section 2; relevant ones are in section 2.5 below |
| **CL-1 to CL-8** | Concurrency tests for the pending-claim limit | `docs/platform-foundation-plan.md` section 0c |
| **D1 (draft)** | The Revision 5 decision on how a lock treats pending claims and transfers | This register |
| **D1 and D2 (plan)** | The plan's decisions on the identity provider and session lifetimes (Gate B-2), which also gate real fresh-authentication enforcement. **Different from the draft's D1** | `docs/platform-foundation-plan.md` Part 3 section 2 |

---

## 1. Source and date summary
| Approval | Date | Source | Class |
|---|---|---|---|
| D3, D4, D7, D13, D15 | 2026-11-04 | `docs/gate-b1-decision-record.md` | H |
| W1 baseline decisions C1 to C10 (relevant ones in section 2.5) | 2026-11-04 | `docs/w1-implementation-plan.md` section 2 | H |
| Gate B-1 scope and boundaries (section 2.1, 2.6) | 2026-11-04 | `docs/gate-b1-decision-record.md` | H |
| X1, X2, X3, A2, A3 (deferred), Y2 (six parts), Y2-A to Y2-D | 2026-11-04 | Draft section 0A and 0E (untracked; see the rule on H sources); F5 handover "Decided by AJ" (local) | H |
| Standing handover rules (section 2.6) | 2026-11-04 | F5 handover (local) | H |
| Section 2.3 (X5, D1, R-C4, X4, B.2, C8 to C16, C3 to C6, Admin count rules 1 to 8) | 2026-11-05 | ChatGPT review, relayed in full | R |
| Section 2.3, Business Admin model clarification | Original date unknown | Relayed on 2026-11-05 as "the previously agreed Business Admin model" | R+O |
| Section 2.4 (A1, B1 to B5, R-C1 to R-C3, C2) | **Original approval date unknown**; relayed 2026-11-05 | ChatGPT review, relayed as summaries | R+O |

---

## 2. Approved decisions

### 2.1 Gate B-1 decisions (H, 2026-11-04)
| ID | Decision (as recorded in the Gate B-1 record) | Note |
|---|---|---|
| D3 | Central roles and Account permissions. "Owner, Admin, Manager, Member kept. Fresh authentication for every Owner-only action" | The four-role part is **superseded by C5**. The fresh-authentication wording is to be reconciled in Revision 6 (C15) |
| D4 | Central business locations. "Product-owned. Branch, Kitchen and Store stay inside their products" | |
| D7 | Product registry. "Ops authoritative; Platform Core caches and refreshes" | |
| D13 | Ownership flows O1 to O4. "One account per product per identity enforced across creation, claims, transfers and invitations. O4 stays blocked on E2" | Approved, amended |
| D15 | "One membership per user per product (new). Strict: all roles, staff included; database-level; no multi-kitchen switcher; second kitchen needs another email" | AJ's 2026-11-05 consolidation statement describes D15 as "one membership per user per product, managed independently by each product" (R). The mechanics are a Revision 6 and design matter |
| D5 | Auth email sender and templates | **Open** in the Gate B-1 record. Not an F5 decision |
| Scope S2 and `F8.3.2` (organisation switcher) | **Removed.** "All multi-kitchen switcher and multi-business dashboard assumptions removed." Blocks: none now | Recorded in the Gate B-1 status table. Consistent with D15 |

The Gate B-1 record also lists "Boundaries kept" (see section 2.6).

### 2.2 Decisions of 2026-11-04 recorded in the draft and handover (H)
| ID | AJ's decision (as recorded) |
|---|---|
| X1 | AJ agrees with the existing D15 identity model: one membership per Platterly product; a person may belong to different businesses across different products; a person cannot have multiple memberships within the same product. The approved D15 rule is retained and the slot uniqueness design is not changed |
| X2 | A separate ownership-offer flow must be used. A standard employee invitation must never independently grant Owner authority |
| X3 | Only an existing Owner may initiate a normal O3 ownership transfer. Staff must use the ownership recovery process instead |
| A2 | No additional cooling-off period. Retain the existing atomic O3 transfer on acceptance. Do not introduce the proposed 72-hour holding state or activation job |
| Y2.1 | Staff authority. Platterly staff may: lock access when there is a credible security concern; investigate ownership and access problems; revoke suspicious pending ownership offers; issue a new ownership recovery claim after completing the verification process. Staff must never directly assign or transfer business ownership. The new Owner must complete the secure claim process |
| Y2.2 | Staff approval. One authorised staff member is sufficient to investigate and approve a recovery action and issue a recovery claim. A second staff member's approval is not mandatory. Recovery permissions must be explicitly restricted to authorised staff; ordinary support staff must not automatically receive them |
| Y2.3 | Staff access to customer businesses. Authorised staff may have limited access to relevant business information when handling support or recovery matters. This does not make them members or employees of the customer's business and grants no Owner-level authority. Detailed support workflows and access-management arrangements are deferred. No permanent or temporary access policy is to be invented now |
| Y2.4 | System actor authority. System actors are automated Platterly processes. They may execute predefined, approved actions: expiring ownership offers after the approved seven-day period; expiring invitations by their approved rules; recording audit events; enforcing approved access restrictions; executing routine account processes. The system must not independently make discretionary ownership decisions, resolve ownership disputes or assign business ownership |
| Y2.5 | Mandatory audit information. For every relevant staff, customer or system action, record all seven details (draft section 0E.2). *The list of seven is taken from draft section 0E.2, not from the Y2.5 sentence itself:* actor category; exact actor or system-process identity; action performed; affected business; date and time; reason, or the associated support or recovery case, where applicable; approval details, where applicable |
| Y2.6 | Initiator and executor. When a person initiates or authorises an action that is executed automatically, record both separately. Do not attribute the decision to the system merely because the system executed it |
| Y2-A | One authorised Platterly staff member is sufficient to investigate and approve an ownership recovery action. A second reviewer is not mandatory. Remove or replace contradictory wording; do not introduce a two-person approval requirement; keep the single-person risk documented as unresolved |
| Y2-B | A security investigation qualifies as an authorised case for revoking a suspicious pending ownership offer. Conditions: a genuine security concern; the staff member has explicit authorisation; a recorded reason; captured in the audit trail. Reconcile with X5 and E-28; ordinary support activity or an unsupported suspicion must not become a reason; do not broaden staff authority |
| Y2-C | The system automatically expires an ownership recovery claim after its approved 14-day validity period. A predefined system action, not an ownership decision; the system cannot independently approve a claim, reject an ownership dispute or assign ownership. Preserve the 14 days; invent no renewal process |
| Y2-D | Staff viewing of customer business information must be recorded even when no changes are made: staff identity, business accessed, date and time, associated support or recovery case, reason for access. Recording is approved; the complete support access system is not. No permanent or temporary access policy, durations, new workflows or permissions model |
| A3 | **Deferred.** "Defer the independent out-of-band notification mechanism. Leave it unresolved for later design. Do not introduce a new recovery-contact field or assume the Ops billing contact is suitable" (see section 4) |

*Scope note from the draft, not AJ's wording:* Y2-B covers pending offers only (draft line 177). It does not let staff start, complete, accept or cancel a transfer, remove an Owner, or act on a transfer that has already been accepted.

### 2.3 Decisions relayed on 2026-11-05 with full wording (R), plus one R+O clarification

#### Business Admin model
| Part | Evidence | Wording |
|---|---|---|
| Model (clarification) | **R+O.** Relayed on 2026-11-05 with the instruction "Treat this as the previously agreed Business Admin model, not a new decision request". The original approval date and wording are not available | The intended Platterly model is: Platterly Core has one business-level Admin. The person registering the business becomes its initial Admin. Admin has overall authority over the business and its product accounts. Products independently manage employee invitations, roles, permissions and access. There is no separate central Owner role above or below Admin. Caterly may retain its internal stored role `owner`, while displaying Admin in its UI. Not a blanket replacement of every occurrence of Owner: central Platterly terminology is distinguished from product-specific implementation terminology |
| Admin count (approved 2026-11-05) | **R** | 1. Every business has exactly one Admin. 2. The person who registers the business becomes its initial Admin. 3. There are no co-Admins or multiple central Admins. 4. The Admin has overall authority over the business and its product accounts. 5. Managers and employees may receive delegated responsibilities, but this does not make them Admins. 6. A normal Admin transfer replaces the existing Admin with the new Admin. 7. Ops-led recovery appoints one new Admin. 8. Previous Owner/co-Owner arrangements must be reconciled against this single-Admin model |
| Scope | **R** | Approval of the business rule only. It does not authorise implementation, schema changes, migrations, or editing the specification |

#### X5 (2026-11-05)
1. The initiating Business Admin can cancel a pending transfer before the nominee accepts.
2. The nominee can decline.
3. Existing employees or other business members cannot independently cancel the transfer.
4. Authorised Ops staff may revoke a suspicious pending transfer only through an authorised recovery, dispute or security-investigation process.
5. Staff revocation requires an authorised reason and an audit trail.
6. A completed transfer cannot be cancelled through the normal pending-transfer cancellation process.

Terminology instruction given with it (quoted): "Use the central role terminology **Admin**, not Owner. Owner may remain as an internal product-specific implementation term."

#### D1 (2026-11-05)
1. Pending claims and transfers expire normally during an ownership lock.
2. Their original expiry dates remain unchanged.
3. Expiry is not paused or extended by the lock.
4. If a claim or transfer expires during the lock, it is recorded as expired.
5. A fresh request is required if the business still needs to proceed after the lock is lifted.

This preserves the existing 7-day transfer and 14-day recovery-claim expiry periods.

#### R-C4: refusal wording (2026-11-05)
As relayed in two messages, quoted:
- "Exact customer-facing refusal wording will be reviewed and approved during implementation, before release. The wording is not being finalised in the current specification review."
- "The current specification should retain the approved refusal principles without trying to finalise every message now."

#### X4: Ops Admin authority (2026-11-05)
First set:
1. The Ops Admin has all Ops permissions by default, including recovery review, ownership locking, investigation and recovery approval.
2. The Ops Admin can grant and revoke specific permissions for other Ops staff.
3. Other Ops staff receive only the permissions explicitly assigned to them.
4. Support staff may open recovery, dispute and security cases but do not automatically receive recovery authority.
5. Permission grants, revocations and sensitive actions must be audited.
6. One specifically authorised Ops reviewer is sufficient; no second reviewer is required.

Additional set:
1. Exactly one Ops Admin exists at a time.
2. The Ops Admin may approve a recovery case even if they personally opened it. No self-review restriction is imposed.
3. Support staff may open recovery, dispute and security cases by default. Case opening does not grant permission to review cases, activate ownership locks, investigate or approve recovery.
4. Preserve the existing rule that one authorised Ops reviewer is sufficient. No second reviewer is required.

Preserved with it: "Preserve the existing approved B1, B.2 and Y2 decisions. Do not introduce a second-review requirement or reopen settled permissions."

#### X4 bootstrap (2026-11-05)
1. Development continues using the existing Ops Admin account.
2. At production go-live, AJ will create the dedicated production Ops Admin account directly in the production database.
3. This account is bootstrap-created by direct database action, not through an invitation, normal user registration or appointment workflow.
4. Exactly one Ops Admin account exists per environment.
5. The Ops Admin has all Ops permissions and can grant or revoke specific permissions for other Ops staff.
6. Do not create another Ops Admin account during the current development phase.

Not an implementation approval. No database changes are authorised now. Future replacement and succession of the Ops Admin is a separate open policy question (section 5).

*History:* an earlier relay on the same date gave five points, including "Exactly one Ops Admin account is active at a time" and "Do not create an additional Ops Admin account during the current development phase". The six-point version above is the clarified version that followed and is the one recorded.

#### B.2: case opening and ownership lock are separate (2026-11-05)
1. Support staff may open a recovery, dispute or security case.
2. Opening a case does not automatically set `ownership_locked`.
3. Specifically authorised Ops staff review the case.
4. Only specifically authorised Ops staff may activate `ownership_locked`.
5. The lock action must record: staff identity, reason, case reference, timestamp.
6. Case creation and ownership locking are treated as separate auditable actions.

#### C8: lock is not mandatory for every recovery (2026-11-05)
1. Every recovery must have a case.
2. Support staff may open the case by default.
3. Specifically authorised Ops staff review the case.
4. They may activate an ownership lock at the start of review when there is a valid reason.
5. If there is no valid reason to lock ownership, recovery may proceed without a lock.
6. Opening a case never automatically activates an ownership lock.
7. The required audit details are preserved for case creation and any lock action.

(An earlier direction on the same date stated that authorised Ops staff may activate a lock when they begin reviewing a case, provided they have a valid reason, and that case opening alone never activates the lock. C8 absorbs it.)

#### C9: authority to clear ownership locks (2026-11-05)
1. Any specifically authorised Ops reviewer may clear an ownership lock.
2. Clearing a lock requires an explicit `clear ownership lock` permission.
3. The Ops Admin has this permission by default.
4. Other Ops staff must be explicitly granted this permission.
5. The person who activated the lock does not have to be the person who clears it.
6. Locks are never cleared automatically, including at the 30-day checkpoint.
7. The clearing action is audited with staff identity, reason, case reference and timestamp.

Preserved with it: "Preserve B1, B.2, B5, X4 and the approved C8 rules."

#### C10: security investigation and revoking suspicious pending offers (2026-11-05)
1. Revoking a suspicious pending offer requires a separate explicit `revoke pending offer` permission.
2. The Ops Admin has this permission by default. Other Ops staff must be explicitly granted it.
3. Support staff may open security cases by default.
4. Opening a security case does not itself authorise investigation or offer revocation.
5. A genuine security concern must identify a specific security issue related to the pending offer.
6. The staff member must record the reason, case reference and audit trail.
7. Unsupported suspicion or routine support activity is insufficient.
8. One authorised Ops reviewer is sufficient. No second approval is required.
9. Preserve X5, Y2-B, B1, B.2, X4 and the approved C8/C9 rules.

#### C11: Ops review-start targets (2026-11-05)
Internal targets for beginning Ops review after Support opens a case:
1. Suspected security compromise: within 1 hour.
2. Ownership dispute: within 1 business day.
3. Routine recovery: within 2 business days.

These are internal review-start targets, not customer-facing resolution promises. If a target is missed: flag the case for escalation to the Ops Admin; preserve the existing B5 rule (the 30-day checkpoint escalates to AJ); do not introduce a new backup authority or automatic case closure or lock.

Preserved with it: "Preserve B1, B.2, B5, C8, C9, C10 and X4."

#### C12: notice timing and the 30-day checkpoint (2026-11-05)
1. Send the existing 7-day notice after Ops completes initial business and evidence verification.
2. Send it to the current Business Admin, whether or not an ownership lock is active.
3. Do not send a separate ownership-lock notification.
4. The 7-day period begins when the notice is successfully sent.
5. The 30-day review checkpoint begins when the case is opened.
6. If an objection changes the case into a dispute, the original 30-day clock continues; it does not restart.
7. At 30 days, escalate the case to AJ. No automatic case closure or unlocking.

The alternative notification route for a potentially compromised Business Admin email is kept as a separate unresolved question (section 5). Do not invent a route.

Preserved with it: "Preserve B4, B5, C8, C9 and C11."

#### C13: pending transfer when the initiating Admin loses authority (2026-11-05)
1. If the initiating Business Admin loses Admin authority through a completed recovery or dispute decision while their transfer offer is pending, the system automatically revokes that pending offer.
2. The nominee is notified that the offer is no longer valid.
3. The nominee cannot accept a revoked offer.
4. The revocation is recorded in the audit trail.
5. This is an automatic consequence of the authorised Admin replacement, not a discretionary ownership decision by the system.
6. Preserve the normal 7-day transfer expiry rule (D1).

Preserved with it: "Preserve X5, C10, C12, Y2.4 and the single-Business-Admin model."

#### C14: fresh authentication for cancelling or declining a transfer (2026-11-05)
1. Only the initiating Business Admin may cancel a pending transfer (X5).
2. Cancelling requires fresh authentication.
3. The nominee may decline a pending transfer with a normal authenticated session.
4. Declining does not require fresh authentication.
5. The existing fresh-authentication requirement for starting a transfer is preserved.

The reconciliation of D3's broader "every Owner-only action" wording stays under C15.

#### C15: Platform Foundation Plan reconciliation, approved approach (2026-11-05)
1. Preserve the existing Platform Foundation Plan as the historical baseline.
2. Prepare a complete Revision 6 amendment proposal covering all approved decisions.
3. Reconcile the single Business Admin model with D3, D13 and D15.
4. Include all subsequent approved decisions, not just the original seven Revision 5 amendments.
5. Preserve historical decisions and label superseded rules clearly. Do not delete historical records.
6. Present the complete Revision 6 proposal to AJ for explicit approval before modifying the plan or related records.
7. This approval does not authorise implementation, schema changes, migrations, Git operations or `F3.2.1`.

#### C16: prerequisites for `F3.2.1` (2026-11-05)
`F3.2.1` does not need to wait for acceptance of the entire `F5.1.0` specification. It must wait until all decisions and approvals directly affecting its implementation are complete:
1. Revision 6 Platform Foundation Plan reviewed and explicitly approved.
2. Single-Business-Admin database invariant technically designed and approved.
3. Organisation membership and product-slot rules finalised.
4. Relevant schema and audit-table decisions approved.
5. Separate implementation and migration approvals granted.

Unrelated open policy questions do not automatically block `F3.2.1`. This defines the gate only. It does not authorise `F3.2.1` implementation, schema changes or migrations.

#### C3: previous Admin after recovery (2026-11-05)
1. Following recovery, the previous Admin's central business membership is disabled by default.
2. The membership record and historical Admin role are retained for audit and history, but the disabled membership grants no active Admin authority.
3. Do not automatically reinstate the previous Admin as an employee.
4. They may return as an employee only through the current Admin's normal employee invitation process, with role and permissions assigned through the applicable product workflow.
5. They may become Business Admin again only through a new normal Admin transfer initiated by the current Admin. *[Annotation, not AJ's wording: overridden by C4 point 4.]*
6. Removal remains limited to B2's approved exceptions: confirmed compromise or abandonment.

E-29 (the staff disable or removal process) is kept open (section 5).

#### C4: normal Admin transfer nominee eligibility (2026-11-05)
1. A nominee must be entirely new to Platterly and must not already have a Platterly account.
2. Any existing Platterly account makes the person ineligible, regardless of which business they belong to.
3. This includes existing employees and Managers of the same business.
4. This strict rule overrides C3 point 5: a previous Admin already has a Platterly account and is therefore ineligible.
5. C3's employee-return route remains unchanged: the previous Admin may return as an employee only through the current Admin's normal employee invitation process.

#### C5: central organisation roles (2026-11-05)
1. Business Admin is the only central organisation authority role.
2. There are no central Manager or Member roles.
3. Employee roles and permissions are managed independently within individual products.
4. Central membership records establish a person's relationship with the business; they do not grant product permissions.
5. Reconcile conflicting older role definitions in Revision 6. Preserve historical decisions and mark superseded wording clearly.

#### C6: employee membership scope (2026-11-05)
1. Employees are managed entirely within the individual products.
2. Employees do not require central business membership.
3. Product employee invitations do not automatically create central organisation membership.
4. Each product independently manages employee membership, roles and permissions.
5. Central organisation membership remains separate from product employee access.

The remaining D15 and invitation-scope questions were to stay open unless resolved by this clarification. AJ's later consolidation statement describes D15 as "one membership per user per product, managed independently by each product".

### 2.4 Decisions relayed on 2026-11-05 as summaries of earlier approvals (R+O)
The original wording **and the original approval date** are not available in any project record or earlier session. 2026-11-05 is the date of the relay. The direction below is as relayed. Revision 5 and the F5 handover list these items as open with the draft's recommendations; those recommendations are not approvals.

| ID | Relayed direction |
|---|---|
| A1 | Freed membership slots become available immediately, with no cooling-off period |
| B1 | Support may open cases; only specifically authorised Ops staff may lock ownership, investigate and approve recovery |
| B2 | Previous Admin membership is disabled by default after recovery; removal is an exception for confirmed compromise or abandonment |
| B3 | Minimum recovery evidence consists of a business document, matching government photo ID, callback to the registered phone and verified access to the proposed email |
| B4 | No separate Admin lock notice; retain the existing 7-day notice to the current Admin |
| B5 | 30-day review checkpoint escalated to AJ; no automatic case closure or unlocking |
| R-C1 | Standard refusal messages, generic claim-link failure message, random support reference ID and restricted investigation information |
| R-C2 | Every refused action creates an audit record; never log secrets, tokens, passwords, OTPs or hashes |
| R-C3 | Relevant other-organisation IDs may be recorded internally, with restricted staff access and audited access |
| C2 | After a normal transfer, the former Admin loses central Admin authority and may choose to remain as an employee or leave. If remaining, the new Admin assigns their employee role and permissions |

**C2 evidence note.** AJ asked that C2 not be reopened "if the existing decision record confirms it". No project record confirms it. It is recorded as approved on AJ's relay of a previously approved direction (R+O), not on a record.

**Detailed conditions.** AJ instructed that "the detailed conditions already recorded in the handover, especially B1–B5 and Y2-A through Y2-D" be retained. The F5 handover and Revision 5 contain the draft's recommended conditions for B1 to B5 and list those decisions as open. No separate record of approved conditions was located. Revision 5's conditions for B1 to B5 are retained as drafted per AJ's instruction; the Y2-A to Y2-D conditions are recorded in section 2.2.

### 2.5 W1 baseline decisions relevant to F5 (H, 2026-11-04)
Source: `docs/w1-implementation-plan.md` section 2, "Approved baseline decisions (AJ, 2026-11-04)". The W1 numbering C1 to C10 is **not** the policy series of this register (see section 0). Wording is quoted unchanged. The relevance notes describe where each item touches F5; they are not decisions.

| W1 ID | Decision (quoted from the W1 plan) | Relevance to F5 |
|---|---|---|
| C2 | `organisation_products` is built in F3.2.1 because `membership_product_slots` references it by foreign key (plan deviation recorded) | `F3.2.1` schema and the slot rules (C16 prerequisites 3 and 4) |
| C3 | F3.2.2 is "Product services and `lockOrganisation`", includes `linkProduct` and `unlinkProduct` as data-layer functions, with no signed sender (`F6.1.2`) | `lockOrganisation` is the lock used by O1 to O4 and claims; product linking |
| C4 | Audit and outbox: tables in F3.2.1; transaction-safe writers before F3.2.2; delivery worker after F3.2.2 | The audit table design is a C16 prerequisite 4 item |
| C6 | `users.id` is a `uuid` (conditions in section 5) | Identity references used in audit actor fields |
| C7 | O1 selects and links the product in the same transaction; no organisation without a link; linking checks every existing member | O1 and D15 enforcement. How "every existing member" applies to employees who need no central membership (C6) is a design item (section 5.3) |
| C8 | A disabled member keeps the slot; only removal frees it; unlinking deletes that product's slots and keeps the membership | Bears on C3 (the disabled previous Admin keeps the slot), A1 (freed slots) and the retained-record design |
| C9 | Caterly enforcement gap acknowledged, not fixed in W1 | D15 is not global until the Caterly integration (F8) is separately approved |
| C10 | `platterly_platform_test` and the Caterly scratch database are in the plan but **not created**; no database creation, data copy or migration without separate approval | C16 prerequisite 5 (separate implementation and migration approvals) |

Audited and not F5 decisions: W1 C1 (`F8.2.4` split into 4a and 4b, a Caterly-phase item) and W1 C5 (`F3.1.1` provider-neutral). They are context for the Caterly boundary only (section 2.6).

### 2.6 Boundaries and standing rules (H, 2026-11-04)
| Rule | Source | Wording |
|---|---|---|
| Caterly boundary | Gate B-1 record, "Boundaries kept" | "Caterly login, kitchen settings, memberships, live operations: Unchanged. Caterly-side enforcement and closing the self-service organisation-create route belong to the Caterly integration (`F8`), a final, separately approved activity." And: "Existing Caterly integration and migration: Final, separately approved activity" |
| Caterly protection | F5 handover, standing rules (AJ, 2026-11-04) | "Caterly's login, invitations, roles, Admin label, permissions and customer-facing behaviour stay unchanged; Platterly adapts. Any Caterly change needs AJ's separate approval" |
| Do only what is approved | F5 handover (AJ) | "Do only what AJ approved; stop and report after each approved action" |
| No invention | F5 handover (AJ) | "Do not invent a staff database model, staff identity provider, permissions schema, access policy or audit table design". X4 (2026-11-05) settles the staff authority policy but not the identity provider, permissions schema or audit table design, which remain technical design items (section 5.3) |
| Approved plan documents | F5 handover (AJ) | "Approved plan documents are changed only by an AJ-approved documentation task; proposals go in the draft." C15 (2026-11-05) is the approved approach for that task |
| Git | F5 handover (AJ) | "No Git staging, commit, push, fetch or pull without fresh explicit approval" |

### 2.7 Gate B-2 decisions (AJ, 2026-11-05)
Evidence: AJ's explicit decision stated in the project conversation on 2026-11-05 (direct, not relayed). The wording below is recorded as given. This section is a documentation record only: it does not implement anything and authorises no implementation.

| ID | Decision (as recorded) | Note |
|---|---|---|
| **D1 (plan): identity provider** | **Better Auth is the selected identity provider for Platterly.** AJ selected "Option A: Proceed with Better Auth" and explicitly approves proceeding without completing the Logto comparison first | The Gate B-2 review (`docs/gate-b2-decision-review-d1-d2.md`) described this as Option A and as an exception to the plan as written |
| D1 exception | `F2.1.4` (Logto evaluation and comparison) is **deferred** by this explicit exception. It is not completed and is not cancelled | Deferred, not completed |
| D1 basis | The existing Better Auth spike evidence (`docs/identity-spike-results.md` and the follow-up reports) remains the technical basis for the selection | Evidence, not a new test |
| D1 limits | This decision does **not** mean that Logto was evaluated or that Logto was found technically unsuitable. Logto remains untested (E1 not given) | |
| **D2 (plan): session policy** | **Approved at policy level by AJ on 2026-11-05, with technical values delegated to design** (the five points below). It was open when D1 was recorded; this row was updated on AJ's approval | Policy approved. **No numeric value is set by this entry** |

**D2 policy as approved (AJ, 2026-11-05).** Wording as given:
| # | Approved policy | Delegated to technical design |
|---|---|---|
| D2.1 | **Product sessions:** a product session must not outlive the identity-provider session | Account and product session lifetimes are finalised in the relevant technical design |
| D2.2 | **Session expiry:** both idle expiry and absolute expiry must be defined | Exact durations and renewal behaviour |
| D2.3 | **Provider outage:** AJ confirms the proposed **24-hour** extension for existing sessions during ordinary identity-provider outages. **No new logins** are allowed during an outage | None (the 24-hour value is the plan's proposal, now confirmed). Its scope stays ordinary outages only, not identity database recovery (AJ, earlier decision 5) |
| D2.4 | **Fresh authentication** is required for sensitive actions, particularly starting and cancelling ownership transfers (C14) | The exact time window |
| D2.5 | **Token lifetimes:** ID, access and refresh token lifetimes | Delegated to `F4.2.2` and the relevant integration design, including `F8.1.3`, within the approved security boundaries |

**Existing constraints cross-referenced (not newly approved here).** Each is recorded elsewhere and is unchanged: no cookie cache initially (AJ decision, `docs/identity-spike-followup-report.md` status table item 2); revocation respects the existing five-minute maximum bound (plan Part 1 section 4 and the revocation design); RP-initiated logout and back-channel logout remain required (plan `F4.2.3`, `F8.1.3`); user-level revoke and "sign out everywhere" remain required (plan `F4.3.1`); identity database restoration invalidates provider sessions (AJ decision 6, `.claude/HANDOVER-2026-11-02.md`); and break-glass authority for the Business Admin **remains open under Decision M** (plan Part 1 section 10, Revision 11 note R11-7).

**F0.1.5 closure exception (AJ, 2026-11-05).** AJ explicitly approved: "F0.1.5 (Gate B-2 closure) may be closed based on the completed D1 and D2 decisions, without completing F2.1.4 or F2.1.5." This is a specific AJ-approved exception to the original roadmap acceptance dependency.
| Item | Record |
|---|---|
| D1 | Better Auth selected |
| D2 | Session policy approved at policy level, with technical values delegated to design |
| **F0.1.5** (Gate B-2 closure) | **Closed by explicit AJ exception on 2026-11-05**, based on D1 and D2 being decided |
| `F2.1.4` | **Deferred, not complete** |
| `F2.1.5` | **Not complete** |
| Original dependencies | The original relationships stay recorded, unchanged, for historical traceability: `F0.1.5` on `F2.1.5` on `F2.1.4`; `F3.1.2` and `F4.1.1` on `F0.1.5` (plan Part 3 section 6). The exception does not rewrite them and does **not** retrospectively complete either F2 task |
| Where the status is recorded | The Foundation Plan's task tables have **no separate status field** (the F0.1.5 row has Depends, Tasks and Done-when columns only), so no roadmap field was changed. The closure is recorded here and in `docs/gate-b2-decision-review-d1-d2.md`. STATUS was not touched by this entry |
| Limits | Closing `F0.1.5` does **not**: authorise `F3.1.2` implementation (`F3.1.2` must still be reviewed against its own dependencies, `F3.1.1` and `F0.1.5`, and its own implementation approval; `F3.1.1` is accepted in stages and not marked complete as a whole); authorise `F3.2.1` or any other `F3.2` task; satisfy any of the five C16 prerequisites; resolve O-F421, Decision M or any other open policy question; or authorise any change to Caterly |

**Distinctions preserved by this entry.**
- `F2.1.4` is deferred, not completed. `F2.1.5` is **not** automatically completed. No `F2` task is marked complete.
- The roadmap dependency chain (`F0.1.5` on `F2.1.5` on `F2.1.4`) is **not rewritten** and no roadmap sequencing or task dependency is changed. Whether `F0.1.5` could close while `F2.1.5` is not complete was a separate approval; AJ gave it on 2026-11-05 (the exception above).
- D1 and D2 are both decided at policy level, and `F0.1.5` was closed on 2026-11-05 by AJ's explicit exception (above). The closure is the exception's effect, not a consequence of D1 and D2 alone, and it leaves `F2.1.4` deferred and `F2.1.5` not complete.
- Exact session durations, renewal behaviour, the fresh-authentication window and the token lifetimes are technical design work. No numeric value is invented here. `F4.2.2`, `F8.1.3` and every other implementation task remain not started and are not marked complete.
- D1 and D2 approval is **not** implementation authorisation. Decision M, C7 and every other open ownership question remain open.
- No `F4` task is completed or authorised by this decision, and `F3.2.1` is **not** authorised. All other implementation gates and prerequisites (the five C16 prerequisites, W1 C10, the release process) are unchanged.
- The conditions listed in the Gate B-2 review (section 5, item 4) are carried as stated there; this decision does not separately confirm or amend them.

---

## 3. Superseded items
Historical text is preserved in the old documents. "Superseded" means it must not be used as the source of truth for Revision 6.

| Old rule or wording | Where | Superseded by |
|---|---|---|
| Multiple owners, cap 3, up to 3 pending owner claims | Foundation Plan Part 1 sections 2, 5, 12; Part 3 section 3; W1 plan section 8B; Revision 5 | Exactly one Admin |
| Initiator "stays Owner, steps down to Admin, or is removed" | Plan O3; Revision 5 | Normal transfer replaces the Admin; C2 |
| `OWNER_CAP` refusal and its message | Revision 5 section 2.C | Exactly one Admin (replacement code is a design item) |
| Floor of one and cap of three (E-17 form) | W1 plan section 8B; Revision 5 | Exactly one Admin. The intent is restated |
| Situation S1 "another Owner exists and can act" | Revision 5 B.1 | No other Admin exists |
| Transfer by a co-Owner when the Owner is unavailable (workflow 3) | Revision 5 3.4 | Recovery |
| "Every current Owner email" notice; "any current Owner" objection | Plan Part 1 section 12; Revision 5 B.2 step 4, B.4 | B4, C12: the one current Admin |
| Admin lock notice (draft recommendation "yes") | Revision 5 B4 row | B4 |
| Frozen items extended by the lock length | Revision 5 3.5 step 2, E-15, D1 row | D1 |
| B.2 step 1 "sets `ownership_locked` at once"; test "Lock set at open"; S5 "lock first" | Revision 5 | B.2, C8 |
| "Platterly staff may lock access" (any staff) | Revision 5 Y2.1 text and 1.4 | B1, B.2: only specifically authorised Ops staff lock |
| "Cleared only by staff, with audit" | Revision 5 lines about workflow 4 and 5 | C9 |
| Reinstatement of the previous Owner through staff, evidence repeat, "new claim, never automatic" | Revision 5 B.3 (c), B.4, option table row B | C3 |
| Previous Admin may become Admin again through a new transfer | C3 point 5 | C4 point 4 |
| Transfer target may "already be a member of this business"; "names a target user" | Foundation Plan Part 3 section 3 (O3) and section 3b; Revision 5 3.3 | C4 |
| Four central roles (Owner, Admin, Manager, Member); Admin limits in D3 | Gate B-1 D3; Plan Part 3 section 4; W1 plan sections 4 and F3.2.3 | C5 |
| Central team membership for every employee; central employee invitations | Plan F5.2.1, F7.2.2, F8.3.x; Revision 5 R2, R3, I1 and I2 | C5, C6 |
| "Decision by AJ plus a recorded second reviewer where possible" | Plan Part 1 section 12; `F5.3.2` | Y2-A, X4 |
| "Existing owner re-issues an expired claim" | Plan Part 1 section 2 "Expired" | D1 point 5 (fresh request) and the single Admin |
| Invitation as Owner; staff-started transfer | Plan O3; Part 1 sections 2 and 12 | X2, X3 |
| "Decision M" (Owner versus Admin) | F5 handover investigation | Moot under the single-Admin model |
| The draft's "proposed" status of X5 and the open status of A1, B1 to B5, R-C1 to R-C4, D1, X4, Y1, Y5, Y6 | Revision 5 header, 0A, 5.2, 5.2a, 6 | Section 2 of this register |

---

## 4. Deferred
| ID | Item | Source |
|---|---|---|
| A3 | "Defer the independent out-of-band notification mechanism. Leave it unresolved for later design. Do not introduce a new recovery-contact field or assume the Ops billing contact is suitable" | H, 2026-11-04 |
| E-25 / Y2.3 detail | Detailed support workflow, access-management arrangements, permanent or temporary access policy, durations | H, 2026-11-04 |
| O4 | Stays blocked on E2 | H (Gate B-1) |
| Exact refusal message text | Reviewed and approved during implementation (R-C4) | R |

---

## 5. Unresolved items

### 5.1 Policy
| ID | Item | Status |
|---|---|---|
| **C7: Admin claims** | How many pending Admin claims (first-Admin, migrated, recovery) may exist per business; how a pending claim and a pending transfer are ordered when both could complete; whether the recipient of a claim must be new to Platterly (C4 is scoped to normal transfer only) | **Open. No approval was found.** Searched: this conversation, all earlier session transcripts for the project, the memory notes, the F5 handover, STATUS, CONTEXT and Revision 5. The item first appears as an open question in the 2026-11-05 single-Admin implications report. The previous rule (up to three pending owner claims) is superseded by the single-Admin model (section 3). No replacement is recorded here and no recommendation is substituted |
| Ops Admin replacement and succession | Who appoints a replacement, how it changes, what happens if the Ops Admin is unavailable or compromised | Open. Kept separate by AJ |
| Alternative notification route for a compromised Business Admin email | | Open. Kept separate by AJ; linked to the deferred A3 |
| E-29 | Whether staff disable or remove the previous Admin directly or through a predefined process | Open. Kept separate by AJ |
| E-32 | What counts as one staff "view" (Y2-D), how long audit records are kept, how they are protected | Open |

#### C7: historical evidence (earlier approved plan rules; not a decision on the single-Admin model)
The closest earlier records are the multi-owner claim rules. They are kept here as history.

| Source | Wording (quoted) | Status under the single-Admin model |
|---|---|---|
| Foundation Plan Part 1 section 2, "Claim uniqueness and competing claims" | "One `pending` claim per `(businessId, boundEmail)` (partial unique index on `businessId` and lower-cased `boundEmail`), and **at most 3 pending owner claims per business**. Issuing a second claim to the same email atomically supersedes the first (the old secret stops working). Issue is refused if current Owners plus pending claims would exceed 3. The 3-Owner cap is re-checked under lock at consumption." The row continues with the atomic-enforcement requirement | **The three-claim capacity ("at most 3 pending owner claims per business", the "exceed 3" test and the 3-Owner cap) is superseded by the single-Admin model.** Not addressed and **not inferred either way**: whether "one pending claim per `(businessId, boundEmail)`" survives, and whether "issuing a second claim to the same email atomically supersedes the first" survives |
| Foundation Plan Part 3 section 0b (Revision 4 change log), item 1 | "Multiple pending owner claims. Uniqueness changed from one pending claim per business to one per `(businessId, boundEmail)`, max 3 pending owner claims per business; issue refused when Owners plus pending would exceed 3; cap re-checked at consumption; membership uniqueness, verified email and atomic consumption unchanged. Tests added: two legitimate owners claim independently, duplicate claim for the same email, three-owner limit" | The "multiple pending owner claims" change and the "three-owner limit" test are superseded in capacity. Nothing else is inferred |
| Foundation Plan Part 3 section 0c, tests CL-1 to CL-8, and the `pending_slot` CHECK (1 to 3) in the Revision 6 and 7 change logs | CL-1 "Exactly 3 succeed, 5 return 'limit reached'"; CL-2 "Owners plus pending is 3"; `pending_slot BETWEEN 1 AND 3` | Capacity-based expectations are superseded. The concurrency mechanism is a design item (section 5.3) |

No project record, earlier session or relayed message states a pending-claim limit, a claim-versus-transfer ordering rule, or a recipient-eligibility rule for Admin claims. None is invented here.

### 5.2 Risks carried (not decisions)
E-04: a compromised sole Admin can hand over the business once the nominee accepts. It now applies to every business, and notices go to the same inbox. E-14: one authorised reviewer can approve a recovery alone (Y2-A, X4). The E-23 consequence of X5 point 3: employees and other members cannot stop an offer except by asking staff to open a dispute.

### 5.3 Technical design items (engineering, no further policy decision)
Single-Admin invariant (counting only the active Admin; atomic replacement; unclaimed or adopted businesses; concurrency; the stored role vocabulary; the retained historical row of a disabled previous Admin). Central membership content and the slot table under per-product D15. The account-exists check at offer and acceptance and creation of the nominee's account through the offer. Case record (type, opened time, review-start time, notice-sent time and delivery result, escalation flag, case reference source). Audit table design (initiator and executor references; lock set and clear fields; permission grant and revoke events; system-triggered revocation; expiry during a lock; recording the direct-database creation of the production Ops Admin; staff-view record). Ops staff identity link, permission storage and enforcement, permission catalogue (including `clear ownership lock` and `revoke pending offer`), staff fresh authentication. Business fields on `organisations` (Y3) and organisation legacy ids (Y4). Lock start time. Definitions of "business day", "Platterly account" and "successfully sent". Refusal codes. Test plan rewrite. Account UI rewrite (F5.2.1, F7.2.2, F8.3.x). External dependencies: D5, the plan's D1 and D2 (fresh-authentication enforcement), E1, E2, F4.

---

## 6. Decisions whose original approval wording could not be recovered
| Item | What exists |
|---|---|
| A1, B1, B2, B3, B4, B5, R-C1, R-C2, R-C3, C2 | Only the relayed direction in section 2.4 (relay date 2026-11-05; original approval date unknown). Revision 5 lists them as open with recommendations, and the F5 handover lists them as open. For C2, the record condition AJ attached was not met (section 2.4) |
| Business Admin model clarification | Relayed as "the previously agreed Business Admin model". The original wording and date are not available. The eight count rules are separately recorded as R (section 2.3) |
| C7 | No approval exists to recover. The only earlier records are the multi-owner claim rules in section 5.1 (historical, capacity superseded). Recorded as open |

All other entries in section 2 carry their wording as recorded in a project record (H) or as relayed in full on 2026-11-05 (R). Some wording is quoted from several relays; where a relay was paraphrased in an earlier version of this register, the entries now quote the original.

---

## 7. `F3.2.1` gate (C16) and status
| Prerequisite | Status |
|---|---|
| 1. Revision 6 Platform Foundation Plan reviewed and approved | Not started. Revision 6 is not drafted |
| 2. Single-Admin invariant designed and approved | Not started |
| 3. Organisation membership and product-slot rules finalised | Not finished. C7 is open and the technical rows in 5.3 remain |
| 4. Schema and audit-table decisions approved | Not started |
| 5. Separate implementation and migration approvals | Not given |

`F5.1.0` is not accepted. `F3.2.1` is not authorised. Nothing in this register changes any other document.

## 8. Change log
| Date | Change | Authority |
|---|---|---|
| 2026-11-05 | File created from the decisions recorded in the 2026-11-05 review conversation | AJ approved Step 1 only |
| 2026-11-05 | Correction-only update after the evidence audit: evidence classes and relay dates (Business Admin model clarification and section 2.4 marked R+O with unknown original dates; H-source caveats); quotation accuracy (A3, Y2-B, Y2.5, X5 terminology, R-C4, X4, "Preserve" lines for C9 to C13); numbering distinctions (policy series, W1 C1 to C10, CL tests, two D1 references); added Gate B-1 scope S2 and `F8.3.2` removal, Caterly boundaries and standing handover rules (sections 2.1, 2.6); added relevant W1 baseline decisions (section 2.5); preserved the C7 historical claim rules and marked the three-claim capacity superseded (section 5.1). No approved decision changed | AJ authorised a correction-only update |
| 2026-11-05 | Added section 2.7: D1 (plan), identity provider, recorded as Better Auth selected, with `F2.1.4` deferred by explicit exception and `F2.1.5` not automatically completed; D2 (plan) recorded as open. No other section changed | AJ's explicit decision (Option A) and authorisation to edit this file |
| 2026-11-05 | Section 2.7 updated: D2 (plan), session policy, recorded as approved at policy level with technical values delegated to design (five points, D2.1 to D2.5), existing session constraints cross-referenced, and the closure statement revised. D1 entry unchanged. No other section changed | AJ's explicit approval of the D2 policy and authorisation to edit this file |
| 2026-11-05 | Section 2.7 updated: F0.1.5 (Gate B-2 closure) recorded as closed by explicit AJ exception, based on D1 and D2 being decided, with `F2.1.4` deferred, `F2.1.5` not complete and the original dependencies left unchanged; roadmap status location recorded (no separate status field). D1 and D2 entries unchanged. No other section changed | AJ's explicit approval of the exception and authorisation to edit this file |
