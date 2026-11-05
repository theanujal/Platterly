# F5.1.0 Ownership-flow specification: Revision 6 (DRAFT for AJ's review)

Drafted 2026-11-05; corrected the same day after two accuracy reviews (section 12, rows 15 and 16) and a scoped correction pass (section 12, row 17). Task: `F5.1.0` in `docs/platform-foundation-plan.md` (Part 3 section 6): "Turn O1 to O4 into a precise spec and test plan; no code".

## 0. Status, sources and how to read this draft

| Statement | State |
|---|---|
| This is a draft | **Not accepted. `F5.1.0` is not accepted.** AJ has not accepted Revision 6 |
| Authorisation | Nothing here authorises `F3.2.1`, any schema, migration, code, database, notification or staff tooling. Accepting this draft would not by itself authorise `F3.2.1`; the gate is defined by decision C16 (section 11) |
| Acceptance scope | If AJ accepts Revision 6, it is accepted **as a decision-reconciled specification only**, on the basis of AJ's explicit instruction in the project conversation on 2026-11-05. That instruction is not an independently recorded project decision: it is not in the decision register or any saved project record, and it carries no A-H, A-R or A-R+O classification. Acceptance would cover the reconciliation and documentation of the ownership-flow decisions and their evidence. **It would not complete `F5.1.0`.** The reviewed test list, which the plan's `F5.1.0` task row lists among its work and acceptance, remains an outstanding deliverable and is to be tracked as a separate follow-up task. No test list is written or reviewed in this draft (section 11.3 holds proposed additions only). The Foundation Plan's `F5.1.0` row is not changed. Section 11.4 records the related open items |
| Revision 5 | Kept unchanged in `docs/f5-ownership-flow-spec-draft.md`. Revision 6 is a separate file |
| Other documents | `docs/platform-foundation-plan.md`, `docs/w1-implementation-plan.md` and `docs/gate-b1-decision-record.md` are **not changed** by this draft. Where this draft would change an approved rule, it says so. The complete plan amendment is a separate future proposal (C15), to be presented for AJ's explicit approval |
| Authoritative record of decisions | `docs/f5-decision-register.md`. If this draft and the register disagree, the register's wording is the record and this draft must be corrected. **One exception:** the register's section 3 row describing Decision M as "Moot under the single-Admin model" is Claude's historical characterisation, not an AJ decision, and is not followed here. Decision M remains open (section 13 item 33). Nothing in this draft, including this exception, establishes that the central Owner of earlier documents, Y2.3's "Owner-level authority" and Business Admin authority are equivalent. The exception ends when the separately gated register correction is approved and applied |
| Other sources | The decision register, Revision 5, the Foundation Plan, the W1 plan, the Gate B-1 record and the F5 handover. (`docs/platform-audit.md` is a Revision 5 source and was not re-read for Revision 6.) Nothing was run and no database was read |

### Evidence and status markers
| Marker | Meaning |
|---|---|
| **[A-H]** | Approved by AJ on 2026-11-04 and recorded in a project record (register section 2.1, 2.2, 2.5, 2.6) |
| **[A-R]** | Approved by AJ on 2026-11-05 in the ChatGPT review and relayed with full wording (register section 2.3) |
| **[A-R+O]** | Relayed on 2026-11-05 as a summary of an earlier approved direction; original wording and date not available (register section 2.4 and the Business Admin model clarification) |
| **[Proposed]** | Text carried from Revision 5 or written to be consistent with the approvals. **Not approved.** AJ's approval of Revision 6 as a whole would be needed |
| **[DECISION REQUIRED]** | An open policy decision for AJ. No recommendation is given |
| **[Deferred]** | Deferred by AJ. Not resolved, not invented |
| **[Risk]** | A security risk or contradiction kept visible until AJ resolves it |
| **[Design]** | A technical design question that needs no further policy decision |
| **[Historical]** | An earlier approved rule, kept as context and marked superseded where the approvals replace it |
| **[Decision M: Admin application unresolved]** | An A-H decision worded for the Owner (X2, X3, Y2.1) cited for the Business Admin. The original wording is preserved. The application to the Business Admin depends on reading "Owner" as Business Admin and is **not an approved Admin rule**; it is unresolved under Decision M |
| **[Open]** / **[UNDECIDED]** | A point that no approval states |
| **[Unresolved]** | The same as [Open], used where the point is a policy gap and not a design question |
| **[Design/Open]** | A technical design question that also depends on a point no approval states |
| **[Derived]** | A statement that follows from approved decisions by inference. No approval states it. It is not an approval |

### Numbering
Several "C" and "D" series exist. In this draft: **R-C1 to R-C4** are the refusal decisions that Revision 5 calls C1 to C4; **C2 to C16** are the policy series used in AJ's 2026-11-05 approvals (numbered by Claude in the consolidated classification and then adopted); **W1 C1 to C10** are the W1 plan's own baseline decisions (unrelated to the policy series); **CL-1 to CL-8** are the plan's concurrency tests; **D1 (draft)** is the lock-expiry decision, and **D1 and D2 (plan)** are the plan's identity-provider and session-lifetime decisions. Details are in register section 0.

---

## 1. Revision history
| Revision | Date | Content |
|---|---|---|
| 1 | 2026-11-04 | First draft. Earlier text is kept only in the session scratchpad, which may no longer exist |
| 2 | 2026-11-04 | Recorded AJ's decisions X2, X3, A2 and A3. Removed the 72-hour holding state, delayed activation and cancel-during-hold workflow. Added Decision X5 as a question |
| 3 | 2026-11-04 | Recorded X1 (decided) and X5 (AJ's proposed decision). Added the contradictions with approved wording (0B) and proposed plan amendments (0D). Redid the `F3.2.1` dependency analysis. Added the decision register (5.2a) |
| 4 | 2026-11-04 | Recorded AJ's six Y2 decisions on staff, customer and system actors (0E) |
| 5 | 2026-11-04 | Recorded AJ's Y2-A to Y2-D: one reviewer suffices, security investigation as a revocation case, system expiry of recovery claims, audit of staff views |
| **6** | **2026-11-05** | **This draft.** Incorporates the corrected decision register: the single-Admin model; X5, D1, X4 and the Ops Admin bootstrap; B.2 and C8 to C16; C2 to C6; R-C4; and the A1, B1 to B5 and R-C1 to R-C3 directions. Replaces the Revision 5 decision register (5.2 and 5.2a) with references to `docs/f5-decision-register.md`. Keeps C7 and the other open matters explicitly unresolved. Corrected after two accuracy reviews (section 12, rows 15 and 16) and a scoped correction pass (row 17) |

---

## 2. Decision references
Full wording and evidence are in `docs/f5-decision-register.md`. This table shows where each decision is applied in Revision 6.

| Decision | Class | Applied in section |
|---|---|---|
| D3, D4, D13, D15; Gate B-1 scope S2 and boundaries | A-H | 4, 5, 9 |
| D7 | A-H | Not applied in this draft (no section applies the product registry decision) |
| X1, X2, X3, A2, Y2.1 to Y2.6, Y2-A to Y2-D | A-H | 4.1 (R2), 4.4, 5, 6 |
| Business Admin model (clarification) | A-R+O | 3, 4 |
| Exactly one Admin per business (rules 1 to 8) | A-R | 3, 4, 5 |
| X5, D1 | A-R | 5.4 |
| X4 (Ops Admin authority, bootstrap) | A-R | 4.4, 7 |
| B.2, C8, C9, C10, C11, C12 | A-R | 5.1, 5.5, 7 |
| C13, C14 | A-R | 5.4 |
| C15, C16 | A-R | 0, 11 |
| C2, C3, C4, C5, C6 | A-R (C2: A-R+O) | 3, 4, 5.4, 5.5 |
| A1, B1, B2, B3, B4, B5, R-C1 to R-C3 | A-R+O | 4.1 (R13, A1), 5.4, 5.5, 5.7 |
| R-C4 | A-R | 5.7 |
| A3, E-25 / Y2.3 detail, O4 | Deferred or blocked | 8 |
| C7, Ops Admin succession, alternative notification route, E-29, E-32 | Open | 8 |

---

## 3. Terminology
| Term | Meaning in this draft |
|---|---|
| **Business Admin** (or **Admin**) | The single central authority person of a business, exactly one per business [A-R]. This draft uses "Admin" for the central authority role, following AJ's terminology instruction (register section 2.3). Whether that makes the central "Owner" of earlier documents, and Y2.3's "Owner-level authority", identical to Admin authority is Decision M, which this draft does not decide. *Relayed evidence* **[A-R+O]**: the Business Admin model clarification, relayed on 2026-11-05 with the instruction "Treat this as the previously agreed Business Admin model, not a new decision request", states "There is no separate central Owner role above or below Admin" (register section 2.3; original wording and date unavailable). This is relayed evidence. It is not treated as a resolution of Decision M, which remains open |
| **Admin (historical)** | In quotations from the Foundation Plan, the W1 plan and Revision 5, "Admin" can mean the second-tier role of the four-role model (Owner, Admin, Manager, Member), which C5 supersedes. That is not the central Business Admin. Example: the O4 wording "the rest become Admin" (section 4.3) |
| **Owner** | Used only (a) in quotations of the Foundation Plan, W1 plan, Gate B-1 record, the original wording of X2, X3, Y2.1 and Y2.3, and Revision 5 text, kept as historical or as original wording; (b) in the titles of Revision 5 edge cases that section 9 retains (E-17, E-23, E-24); and (c) for Caterly's stored role `owner`, which Caterly may retain internally while displaying "Admin" [A-R+O]. Using the word for original wording does not decide Decision M |
| **Owner-worded decisions** | X2, X3 and Y2.1 were approved on 2026-11-04 with the word "Owner" [A-H]; their original wording is quoted unchanged. Where this draft cites one for the Business Admin and no later decision states the Admin-specific behaviour (X5 point 1, C13, C14, Admin rules 2, 5, 6, 7), the application is marked [Decision M: Admin application unresolved]. Y2.2 has no Owner wording and carries no Decision M dependency. Y2.3's "Owner-level authority" is quoted separately in section 4.4 and is also a Decision M matter |
| **Employee** | A person managed inside a product. Employees, Managers and Members are product concepts. There are no central Manager or Member roles [A-R]. In D15 and Foundation Plan section 3b a business's own people are called "staff" ("as owner or as staff"); that is a different use of the word from Platterly's own authorised staff [A-H] |
| **Nominee** | The person offered the Admin role in a normal transfer. Revision 5 called this person the "target" |
| **Ops Admin** | The single Ops staff account with all Ops permissions, one per environment [A-R]. **Not the same as the Business Admin** |
| **Specifically authorised Ops staff** (Ops reviewer) | Ops staff who hold the permissions needed to review cases, lock, clear locks, investigate and approve [A-R] |
| **Authorised staff** | Platterly staff as worded in Y2.1 to Y2.3 ("Platterly staff", "authorised staff"); those decisions do not limit the term to Ops staff. "Specifically authorised Ops staff" is the narrower term used in B1, B.2, X4, C9 and C10 [A-H, A-R, A-R+O] |
| **Support staff** | Ops staff who may open recovery, dispute and security cases by default and receive no recovery authority automatically [A-R] |
| **Case** | A recovery, dispute or security case. Support staff may open one by default [A-R, B.2, X4]. X4 also contemplates the Ops Admin having personally opened a case, so other authorised staff may open cases; who else may is not stated |

---

## 4. Architecture and rules

### 4.1 Rules (Revision 5 rules R1 to R12, updated, plus R13)
| # | Rule | Status |
|---|---|---|
| R1 | One email is one Platterly identity (a row in `users`) | Unchanged [Foundation Plan section 3b, the D15 rule text; D15 is A-H] |
| R2 | A person has at most one membership per product (D15): all roles, staff included, enforced at database level, no multi-kitchen switcher; a second kitchen in a product needs another email [A-H, Gate B-1]. "Staff included" refers to a business's own staff: the identity "cannot hold a second Caterly membership, as owner or as staff" [Foundation Plan section 3b, the D15 rule text]. That wording does not mention Platterly's own authorised staff. The Gate B-1 record also states "no switcher, no multi-business list". AJ's decision X1 confirms that a person may belong to different businesses across different products and cannot have multiple memberships within the same product [A-H, X1]. AJ's 2026-11-05 consolidation instruction describes D15 as "managed independently by each product" [stated by AJ in that instruction; not a separately dated approval]. The central mechanism, and how database-level enforcement fits per-product management, are design items (section 10, section 13 item 1) | Amended |
| R3 | A business is an organisation (`biz_<32hex>`). It has **exactly one central Admin**. The central membership record establishes a person's relationship with the business and grants no product permissions [A-R, C5 and C6]. Employees are managed within products and need no central membership | Amended; the earlier "several members, each with a central role" is superseded |
| R4 | A business has at most one link per product, which is its "account" in that product | Unchanged [Foundation Plan and W1 plan wording; not listed in the register] |
| R5 | Several people can use a product account, according to the product's own roles and permissions, which the product manages independently [A-R] | Amended |
| R6 | The only central organisation authority role is Admin [A-R, C5]. D3 requires fresh authentication for "every Owner-only action" [A-H, D3]. Its reconciliation with the Admin model is part of the future Revision 6 plan proposal (C15). Starting and cancelling a transfer require it [A-R, C14] | Amended; the four central roles of D3 are superseded by C5 |
| R7 | Admin authority is acquired by creating the business (O1), where the registrant becomes the initial Admin [A-R, Admin rule 2]; by a normal Admin transfer, which replaces the existing Admin [A-R, Admin rule 6]; and by an Ops-led recovery, which appoints one new Admin [A-R, Admin rule 7]. Delegated responsibilities given to Managers and employees do not make them Admins [A-R, Admin rule 5]. The plan's O2 and O4 routes are claims (O4: section 13 item 35). Revision 5's R7 and the approved X2 are worded for the Owner: "Owner is obtained only by… Never by role assignment, never by a standard invitation (I1)" [Historical, Revision 5 R7, which cites plan Part 3 sections 3, 3a and 4; it is not a Foundation Plan rule]; "A standard employee invitation must never independently grant Owner authority" [A-H, X2]. No Admin-specific decision states that a standard invitation or role assignment can never confer Admin authority, so this draft does not state that restriction as an approved Admin rule **[Decision M: Admin application unresolved]**. C6 point 3 says product employee invitations do not automatically create central organisation membership [A-R] | Amended |
| R8 | Every business has exactly one Admin [A-R, Admin rule 1]. How this applies to a business that has no Admin yet (Ops-provisioned or imported, awaiting a claim) is not stated by an approval [Design/Open]. This replaces the earlier maximum of 3 Owners, the cap that counted pending claims, and the last-owner floor. How the invariant is enforced is a design item | Superseded [Historical]; invariant is [Design] |
| R9 | Central membership grants no product permissions. Caterly's own roles, overrides, Branch, Kitchen and Store stay inside Caterly (D4) [A-R, A-H] | Amended |
| R10 | Caterly login, invitations, roles, Admin label, permissions and customer-facing behaviour stay unchanged; Platterly adapts. Any Caterly change needs AJ's separate approval. D15 is not global until the Caterly integration (F8) is separately approved and verified [A-H, register 2.6] | Unchanged |
| R11 | Email is a one-time proof, never the stored identity or a join key. The claim email stays only in the audit log [Foundation Plan Part 3 section 3 (O2); not listed in the register] | Unchanged |
| R12 | Deleting a business is not available in Account; staff only, manual [Foundation Plan, as carried by Revision 5 R12; not listed in the register] | Unchanged |
| R13 | Freed membership slots become available immediately, with no cooling-off period [A-R+O, A1]. A disabled member keeps the slot; only removal frees it; unlinking deletes that product's slots and keeps the membership [A-H, W1 baseline C8]. *Revision 5 additionally proposed* that a slot freed by removal, leaving or unlinking is usable in the same transaction [Proposed, Revision 5 A.1] | New (restores A1) |

### 4.2 How the concepts relate
```
Identity (users)                 one per email, global id, not tied to any business
   |
   v
Central membership record        a person's relationship to a business; the Admin has the only
(organisation_members)           central authority role; status active | disabled | removed;
                                 a disabled previous Admin's record and historical Admin role
                                 are retained for audit (C3)
   |
   v
Product access                   managed entirely inside each product: employee invitations,
                                 roles, permissions (C5, C6)
```
The role of the `membership_product_slots` table under per-product management of D15, and which people have a central record at all (employees need none, C6), are design items [Design] (section 10). The table names (`organisation_members`, `membership_product_slots`) and the status values `active | disabled | removed` in the diagram are carried from the plan, the W1 plan and Revision 5. They are **[Proposed]** and **[Design]** material, not an approved schema. A disabled previous Admin record (C3) and removal only for confirmed compromise or abandonment (B2) are approved concepts; their stored representation is not approved. C16 prerequisites 3 and 4 are outstanding.

| Concept | What it is | What it is not |
|---|---|---|
| **Admin authority** | The central authority over the business and its product accounts, held by exactly one person at a time [A-R] | Approved acquisition routes: creating the business, a normal Admin transfer, and an Ops-led recovery [A-R, Admin rules 2, 6, 7]. Delegated responsibilities given to Managers and employees do not make them Admins [A-R, Admin rule 5]. The Owner-worded restriction is preserved as written: "A standard employee invitation must never independently grant Owner authority" [A-H, X2]. Whether that invitation restriction, or the Revision 5 R7 wording on role assignment, applies to Business Admin authority is **[Decision M: Admin application unresolved]** and is not stated here as an approved Admin rule (R7, section 5.4, section 11.3) |
| **Central membership record** | The relationship of an identity to a business [A-R] | Not product access and not product permissions |
| **Product access** | The right to use a product's account, with roles and permissions that the product manages [A-R] | Not granted centrally |

### 4.3 What changes the Admin
| Event | Flow | Notes |
|---|---|---|
| New business by a verified user | O1 | The creator becomes the initial Admin [A-R]. The creator must hold no slot for the product. Full O1 mechanics are carried from the plan; no Revision 6 change except the Admin terminology |
| Business with no Admin, or a recovery | Claim (O2, recovery claim) | Staff-issued, email-bound, 14 days. **Pending-claim rules: [DECISION REQUIRED, C7]** (section 8) |
| Normal transfer | O3 | Two-party transfer [plan O3]; 7-day expiry [A-H, Y2.4; A-R, D1]; fresh authentication at the start [A-R, C14 point 5]; the nominee must be entirely new to Platterly [A-R, C4]; the transfer replaces the Admin [A-R, Admin rule 6] |
| Migrated customer | O4 | [Historical, plan Part 3 section 3, O4 row] Quoted: "The source records establish who the legitimate owners are (one or several, maximum 3 = the cap in Part 1 section 12). AJ confirms each owner out of band and approves the list; if the source shows more than 3, AJ chooses 3 and the rest become Admin. One O2 claim per confirmed owner is issued to that person's confirmed address (claim uniqueness is per (businessId, boundEmail), at most 3 pending per business, and the 3-Owner cap is re-checked at consumption)." These multiple-owner mechanics, the pending-claim limit and the claim uniqueness are historical plan wording. They are **not current approved rules** and conflict with the single-Admin model [A-R, Admin rules 1 and 3]. "Admin" in this quotation ("the rest become Admin") is the second-tier role of the four-role model that C5 supersedes; it is not the central Business Admin (section 3, Admin (historical)). This row does **not** describe the O4 flow as superseded. **Blocked on E2** [A-H, Gate B-1 D13]. The general three-pending-claim capacity is marked superseded in section 8.1 by AJ's instruction; that is not a statement about the O4 flow. See section 13 item 35 and C7 |
| Recovery after lock-out | Case, then recovery claim | Section 5.5. One new Admin is appointed [A-R] |
| Admin "steps down" to another role | Not described by any approval | The plan's O3 row and Revision 5 let the initiator stay or step down [Historical]. C2 states that after a normal transfer the former Admin loses central Admin authority and may remain as an employee or leave [A-R+O, C2]; C5 leaves one central authority role [A-R]. That no separate step-down route remains is **[Derived]** from C2 and C5; no approval states it. How the sole Admin may otherwise leave is not stated (E-07) |

### 4.4 Who may act on ownership
| Actor | May | May not |
|---|---|---|
| **Business Admin** | Start a normal Admin transfer (fresh authentication); cancel their own pending transfer (fresh authentication) [A-R: X5 point 1, C13 point 1, C14 points 1, 2 and 5] | A state of the approved central model, not a permission rule: "There are no co-Admins or multiple central Admins" [A-R, Admin rule 3]. That the Business Admin therefore cannot add a co-Admin is **[Derived]**. This concerns the central Admin role only; product-managed employee roles (Managers, employees) are separate [A-R, C5, C6] |
| **Nominee** | Accept or decline an offered transfer; decline with a normal authenticated session [A-R] | Start or cancel a transfer |
| **Employees and other business members** | Whatever the product allows | Cancel a pending transfer [A-R, X5 point 3] |
| **Support staff** | Open recovery, dispute and security cases by default [A-R] | Review cases, lock, clear locks, investigate, approve recovery, or revoke an offer without the explicit permissions [A-R] |
| **Authorised staff** (the wording of Y2.1 to Y2.3; not Ops-specific) | Investigate and approve a recovery action and issue a recovery claim; one authorised staff member is sufficient [A-H, Y2.2]; issuing follows "completing the verification process" [A-H, Y2.1]. Have limited access to relevant business information when handling support or recovery matters (details deferred; every view is audited) [A-H, Y2.3, Y2-D]. Recovery permissions "must be explicitly restricted to authorised staff; ordinary support staff must not automatically receive them" [A-H, Y2.2] | Directly assign or transfer business ownership [A-H, Y2.1]. Limited access to relevant business information does not itself make authorised staff members or employees of the customer's business [A-H, Y2.3]. Whether issuing a recovery claim is exclusively an Ops permission is not stated: B1 and X4 do not mention issuing, so no Ops-only attribution is made |
| **Specifically authorised Ops staff** | Review cases [A-R, B.2 rule 3]; lock with a recorded reason (for a recovery, when there is a valid reason) [A-R, B.2 rules 4 and 5; C8]; clear a lock if granted `clear ownership lock` [A-R, C9]; revoke a pending offer if granted `revoke pending offer` [A-R, C10]; investigate and approve recovery [A-R+O, B1; A-R, X4 points 1 and 6] | Directly assign or transfer ownership; start a normal transfer; clear or set locks without the permissions [A-H, A-R]; hold "Owner-level authority" (Y2.3's wording; whether that equals central Business Admin authority depends on the central Owner/Admin relationship, Decision M, which this draft does not decide) [A-H, Y2.3] |
| **Ops Admin** | All Ops permissions by default; grant and revoke permissions for other Ops staff; may approve a recovery case they opened [A-R] | Be duplicated: exactly one per environment |
| **System** | Execute predefined, approved actions: expire offers after seven days; expire recovery claims after 14 days; expire invitations by their rules; revoke a pending offer as the automatic consequence of an authorised Admin replacement (C13); record audit events; enforce approved access restrictions; execute routine account processes [A-H, Y2.4; A-R] | Make discretionary ownership decisions; resolve disputes; assign ownership; clear a lock |

Limited access to relevant business information does not itself make authorised staff members or employees of the customer's business [A-H, Y2.3]. D15's "staff included" refers to a business's own staff holding a membership in any role (plan section 3b: "as owner or as staff"; this reading of the D15 wording comes from the plan text, not from a separate approval) [Foundation Plan section 3b, the D15 rule text; D15 is A-H]. Whether Platterly's authorised staff can hold a membership, and therefore a product slot, through a separate process is not stated by an approval **[Open]**. Every relevant action records the seven audit details, with initiator and executor recorded separately, and every staff view of customer business information is recorded (section 6).

---

## 5. Flows

Common to all state changes [Proposed, carried from Revision 5, consistent with W1 plan]: the shared `lockOrganisation` (one organisation per transaction), exactly one audit row per state change, events through the outbox in the same transaction, `lower(email)`. Email notifications wait for D5 (open).

### 5.1 State models
**Claim:** `pending`, `consumed`, `expired`, `revoked`, `superseded` [Historical status list from the plan]. Expiry of a **recovery** claim after 14 days is a predefined system action [A-H, Y2-C]. The 14-day period is the plan's claim rule. Whether the same system expiry action is approved for other claims (first Admin, migrated customers) is not named by Y2-C (Revision 5 section 0E.4, gap 15). Whether the `superseded` transition survives under the single-Admin model is **[DECISION REQUIRED, C7]**. Statuses and the pending-slot mechanism are **[Design]**.

**Normal Admin transfer (O3)** (state names are working labels [Proposed])
```
offered ──nominee accepts, checks pass──> completed   (one transaction; authority at acceptance)
   │  │            └─ checks fail ──> refused
   │  ├─ decline (nominee) ──> declined
   │  ├─ cancel (initiating Admin only, fresh authentication) ──> cancelled
   │  ├─ revoke (authorised Ops staff with `revoke pending offer`, through a recovery,
   │  │         dispute or security-investigation case) ──> revoked
   │  ├─ revoke (system, automatic, when the initiating Admin loses authority through a
   │  │         completed recovery or dispute decision; C13) ──> revoked
   │  └─ ownership lock set ──> acceptance blocked; the offer is NOT paused or extended (D1)
   └─ 7 days, including during a lock ──> expired (recorded as expired)
```
No holding state and no delayed activation [A-H, A2]. After completion the transfer cannot be cancelled through the normal pending-transfer process [A-R, X5 point 6].

**Case** (recovery, dispute or security). The shared lifecycle below applies to every case type. The outcome paths below differ by case type.
```
Shared lifecycle (every case type)
opened: support staff may open a recovery, dispute or security case; opening a case never
        sets ownership_locked
        [A-R: B.2 rules 1 and 2; C8 point 6; X4 additional rule 3]
   └─> under review: specifically authorised Ops staff review the case [A-R: B.2 rule 3]
          · review-start targets: suspected security compromise within 1 hour, ownership
            dispute within 1 business day, routine recovery within 2 business days; internal
            review-start targets, not customer-facing resolution promises [A-R: C11]
          · if a target is missed: flag the case for escalation to the Ops Admin; no new
            backup authority and no automatic case closure or lock [A-R: C11]
            (what the Ops Admin then does, and whether the flag is audited, is not stated)
          · lock activation: only specifically authorised Ops staff may activate
            ownership_locked; a separate audited action recording staff identity, reason,
            case reference and timestamp [A-R: B.2 rules 4 to 6]
               - for a recovery: at the start of review, when there is a valid reason; if
                 there is none, recovery may proceed without a lock [A-R: C8 points 4, 5]
               - whether a dispute or security case may or must lock: not stated
          · lock clearing: requires the explicit `clear ownership lock` permission (the Ops
            Admin has it by default; other Ops staff must be granted it); any specifically
            authorised Ops reviewer holding it may clear a lock, whether or not they set
            it; locks are never cleared automatically, including at the 30-day checkpoint
            [A-R: C9 points 1 to 6]

Recovery case: outcome path
   · 30-day checkpoint [recovery path]: begins when the case is opened [A-R: C12 point 5].
     If an objection changes the recovery case into a dispute, the original clock
     continues and does not restart [A-R: C12 point 6]. At 30 days the case is escalated
     to AJ; no automatic case closure or unlocking [A-R: C12 point 7; A-R+O: B5].
     This escalation is separate from the missed-target flag above [A-R: C11].
   · verification ──> notice sent: the notice follows initial business and evidence
     verification [A-R: C12 point 1]; the 7-day period starts when the notice is
     successfully sent [A-R: C12 point 4]
        ├─ objection ──> disputed (see the dispute path) [Proposed, Revision 5 B.4]
        └─ decision by one authorised staff member [A-H: Y2.2, Y2-A]; the Ops-reviewer
           wording is X4's [A-R: X4 point 6]
              ├─ approved ──> recovery claim issued ──> claim consumed ──> closed
              └─ rejected ──> closed
   [Proposed, Revision 5: the objection, decision, claim-issue, consume and closing states and their order]

Dispute case: outcome path [Proposed, Revision 5]
   disputed ──> outcome and who decides: [DECISION REQUIRED] (sections 5.6 and 13)
   Whether the 30-day checkpoint applies to a case initially opened as a dispute:
   [UNDECIDED]

Security case: offer path [A-R: C10]
   revocation of a pending offer needs the separate `revoke pending offer` permission, a
   recorded reason, the case reference and the audit trail ──> offer revoked
   Whether the 30-day checkpoint applies to a case initially opened as a security case:
   [UNDECIDED]
```
The Revision 5 state `opened(lock set)` is superseded [Historical]. Outcome states are working labels [Proposed]; the case record is **[Design]**.

### 5.2 O1: new business
Carried from the plan. The verified creator becomes the initial Admin and holds the slot for the product in the same transaction [A-R, A-H]. The creator must hold no slot for the product (D13). The refusal when they already do is covered by the refusal principles (5.7). No other change in Revision 6 beyond terminology. [Proposed]

### 5.3 O2 and O4: claims
| Item | Content |
|---|---|
| Actors | The staff member who issues the claim, the claimant (a verified user), the system. *Recovery claims:* an authorised staff member [A-H, Y2.2]. *Ordinary O2 claims:* "Staff or Ops issues a claim" [Historical, plan O2]; any role restriction for ordinary claims under the single-Admin model is not stated by an approval **[Unresolved]** |
| When | A business with no Admin (Ops-provisioned or imported), or a recovery (5.5) |
| Preconditions | The business exists. **Pending-claim limit: [DECISION REQUIRED, C7].** **Recipient eligibility: [DECISION REQUIRED, C7].** **D13 is approved [A-H, 2026-11-04; Gate B-1 record]:** "One account per product per identity enforced across creation, claims, transfers and invitations." This rule remains pending the reconciliation required under C15 (section 11.1) and is not a C7 matter. The plan's mechanism (the bound email has no slot for any product the business is linked to) is [Historical] plan wording. C7's recipient eligibility (register section 5.1: whether the recipient of a claim must be new to Platterly) remains open and is not decided here |
| Steps | 1. A claim bound to an email is issued under the organisation lock [Proposed, Revision 5 3.2]. *Recovery claim:* issued by an authorised staff member after the verification process [A-H, Y2.1, Y2.2]. *Ordinary O2 claim:* "Staff or Ops issues a claim bound to an email" [Historical, plan O2]; the issuer's role restriction is **[Unresolved]**. 2. A one-time secret is sent to that address [plan O2]. 3. The claimant signs in with that verified email and opens the link; consumption needs both the secret and a sign-in whose verified email matches [plan O2]. 4. One transaction: the claim moves to `consumed`; product slots and events are written [Proposed]. *Recipient's role:* for a recovery, an Ops-led recovery appoints one new Admin [A-R, Admin rule 7]. For an ordinary O2 claim the plan "creates `Owner` membership for the signed-in user id", and whether that makes the claimant the Admin depends on reading "Owner" as Business Admin **[Decision M: Admin application unresolved]**. Rules from the plan: 14 days, secret plus verified matching email |
| Same-email handling | Whether issuing a second claim to the same email supersedes the first is **[DECISION REQUIRED, C7]** |
| Expiry during a lock | Pending claims expire normally during an ownership lock; their original expiry dates are unchanged; expiry is not paused or extended; a claim that expires during a lock is recorded as expired; a fresh request is required if the business still needs to proceed [A-R, D1 points 1 to 5]. D1 does not say how a replacement claim is issued; that depends on C7 **[Derived]** |
| Who issues non-recovery claims | *Ordinary O2 and O4 claims.* The plan says "Staff or Ops issues a claim" [Historical, plan O2]. Y2.1 and Y2.2 concern recovery claims ("authorised staff"). Whether ordinary claim issuance has the same authorisation rules as recovery-claim issuance is not stated, and no role restriction for ordinary claims (for example Ops-only or reviewer-only) is stated by an approval. **Unresolved policy gap, not design** (Revision 5 section 0E.4 row 4; section 13 item 13) |
| Initiator and executor | Issued: initiated by the issuing staff member and executed by the system, recorded separately [A-H, Y2.6; per-action representation Proposed, Revision 5 0E.3]. The issuer is an authorised staff member for a recovery claim [A-H, Y2.2] and "Staff or Ops" for an ordinary O2 claim [Historical, plan O2]. Consumed: initiated by the claimant, executed by the system. Expired (recovery claims): the system under the predefined rule [A-H, Y2.6, Y2-C]. Other claims: not named by Y2-C |
| Notifications | Claimant: the claim email with the one-time secret. *[Proposed, Revision 5 3.2]* the current Admin, if one exists, is told that a claim was issued; staff receive a consumption confirmation. Whether the claim-issue notice survives under the single-Admin model is not decided. It is separate from the 7-day notice of C12, which is sent after verification and before approval. All notifications wait for D5 |
| Audit | `ownership.claim.issued`, `.superseded` (subject to C7), `.revoked`, `.expired`, `.consumed`, `ownership.refused` (names are proposals) |
| Tests | Plan list (competing, replay, expired, wrong email, wrong secret, double submit); the capacity tests CL-1 to CL-8 are superseded in count and are redesigned once C7 is decided |

### 5.4 O3: normal Admin transfer
| Item | Content |
|---|---|
| Actors | The initiating Business Admin (fresh authentication), the nominee, the system. A pending transfer has an "initiating Business Admin" [A-R: X5 point 1, C13 point 1, C14 points 1 and 5]. Staff must never directly assign or transfer business ownership [A-H, Y2.1]; X3 adds "Staff must use the ownership recovery process instead" [A-H, X3]. X3 also states "Only an existing Owner may initiate a normal O3 ownership transfer". Whether that exclusivity (no other actor, such as an employee, may initiate) applies to the Business Admin depends on reading "Owner" as Business Admin **[Decision M: Admin application unresolved]**; this draft does not state it as an approved Admin rule |
| Preconditions | X5, C13 and C14 refer to the "initiating Business Admin" of a pending transfer [A-R: X5 point 1, C13 point 1, C14 points 1 and 5]; this describes that role in the transfer flow and is not an independent condition. X3 states "Only an existing Owner may initiate a normal O3 ownership transfer" [A-H, X3]; whether that exclusivity (no other actor may initiate) applies to the Business Admin is **[Decision M: Admin application unresolved]** and is not stated here as an approved Admin rule. Conditions: business not `ownership_locked`; no pending transfer; no email-change hold (the plan's 72-hour hold); **the nominee must be entirely new to Platterly and must not already have a Platterly account, which includes existing employees and Managers of the same business [A-R, C4]**. The definition of "Platterly account" is **[Design]**. A pending Admin claim on the same business: **[DECISION REQUIRED, C7]** |
| Steps | 1. The initiating Business Admin names the nominee [A-R: X5 point 1, C13 point 1], by email [Proposed, Revision 5 3.3], through a separate ownership-offer flow [A-H, X2 first sentence]. X2 also states that "A standard employee invitation must never independently grant Owner authority"; whether that applies to Admin authority is **[Decision M: Admin application unresolved]**. 2. Start takes the organisation lock, re-checks the conditions and writes the pending transfer with a 7-day expiry. 3. The nominee is notified (waits for D5). 4. The nominee signs in with a verified email and accepts [plan O3]. How a nominee with no existing Platterly account reaches that point is not decided (Revision 5 section 0C). Revision 6 does not state that an account is created through the offer **[Design/Open]**. 5. One transaction under the lock: re-check the conditions; replace the Admin with the nominee; apply the former Admin's outcome. **Authority passes at acceptance** [A-H, A2]. *Checks retained from approved text:* the business is not `ownership_locked` and there is no email-change hold [plan O3 and Part 1 section 12]; the nominee signs in with a verified email [plan O3]. *Check from Revision 5 only:* the nominee is not disabled [Proposed]. *Applicability unresolved:* the plan's check that Owners after the change plus pending claims do not exceed 3 (the Admin rules and C7 do not say how counts apply), and the plan's check at start and acceptance that the target holds no slot for the product, against C4's nominee-eligibility rule, which does not say whether it replaces, narrows or adds to that check [Open] |
| Former Admin | The former Admin loses central Admin authority and may choose to remain as an employee or leave. If remaining, the new Admin assigns their employee role and permissions [A-R+O, C2]. *The choice itself is approved.* The plan's O3 row (historical) already had the initiator choose. *Timing:* neither C2 nor the plan states a step; Revision 5 placed the choice at the start of the transfer [Proposed]. *Representation* of "remain" and "leave" in the central record is **[Design]**. A freed slot follows R13 |
| Cancel | Only the initiating Admin, with fresh authentication [A-R, X5, C14]. Employees and other members cannot [A-R, X5 point 3] |
| Decline | The nominee, with a normal authenticated session; no fresh authentication [A-R, C14] |
| Staff revocation | Authorised Ops staff may revoke a suspicious pending offer only through an authorised recovery, dispute or security-investigation process. Revocation needs the separate explicit `revoke pending offer` permission. Opening a security case does not authorise investigation or revocation. A genuine security concern must identify a specific security issue related to the pending offer. The staff member records the reason, the case reference and the audit trail. Unsupported suspicion or routine support activity is insufficient. One authorised Ops reviewer suffices [A-R, X5, C10; A-H, Y2-B]. Scope: pending offers only [Proposed, Revision 5 scope note; not AJ's wording] |
| Expiry | 7 days. A lock does not pause or extend it. If it expires during a lock it is recorded as expired. A fresh request is needed after the lock is lifted [A-R, D1] |
| Automatic revocation | If the initiating Admin loses authority through a completed recovery or dispute decision while the offer is pending, the system revokes it, notifies the nominee, and records it in the audit trail. This is an automatic consequence of the authorised replacement and not a discretionary system decision. The nominee cannot accept a revoked offer [A-R, C13] |
| After completion | Cannot be cancelled through the normal process [A-R, X5 point 6]. *[Proposed, Revision 5 3.8]* The routes are a dispute and a recovery case |
| Initiator and executor | Start: Admin / system. Accept: nominee / system. Staff revoke and automatic revoke: recorded with initiator and executor separately [A-H, Y2.6] |
| Notifications | All notifications in this row are [Proposed] (Revision 5): the nominee gets the offer and a reminder before expiry; the Admin gets the result; revocation, expiry and decline notices. All wait for D5. **Notices are informational. They are not a security control** (E-04) |
| Audit | `ownership.transfer.started`, `.completed`, `.declined`, `.cancelled`, `.revoked` (with the case reference where one exists; a system-triggered variant), `.expired`, `ownership.refused` (names are proposals) |
| Events | `owner.changed` and `membership.changed` at completion (names to be renamed with the Admin terminology) **[Design]** |
| Tests | See section 11 |

### 5.5 Recovery after lock-out (case workflow)
Applies to situations S3 to S6 below. Revision 5's S1 and S2: S1 ("another Owner can act") is superseded because no co-Admin exists [Historical]; S2 (sole Admin forgot the password or lost the second factor) is account recovery in `F4.1.2` and is not an ownership matter.

| # | Situation | Route |
|---|---|---|
| S3 | The Admin lost control of the email address | Recovery case [Proposed] |
| S4 | The Admin "chose the wrong email" at sign-up or claim | Same case; E-12 for a staff-typed claim email [Proposed] |
| S5 | The Admin's identity is suspected compromised | Security case; user-level revocation (plan Part 1 section 11); the same recovery case. The Revision 5 "lock first" is superseded because a lock now needs a case [Proposed] |
| S6 | The Admin is unreachable or deceased and others claim | Recovery case with extra evidence about the relationship to the business; never decided on one claimant's word. If contested it becomes a dispute [Proposed] |

| Step | Rule |
|---|---|
| 1. Open | Support staff may open a recovery, dispute or security case with a reason and the applicant's name [A-R, B.2, X4]. **Opening a case never sets `ownership_locked`** [A-R, B.2, C8]. Rate limits apply to case opening [Proposed, carried]. Case opening is audited as its own action. Setting the case type is **[Design]** |
| 2. Review | Specifically authorised Ops staff review the case [A-R]. Internal review-start targets: suspected compromise within 1 hour, ownership dispute within 1 business day, routine recovery within 2 business days. If a target is missed, the case is flagged for escalation to the Ops Admin; no new backup authority and no automatic closure or lock [A-R, C11]. "Business day" is not defined **[Design]** |
| 3. Lock (optional) | Specifically authorised Ops staff may activate `ownership_locked` at the start of review when there is a valid reason [A-R, B.2 rule 4; C8 point 4]. If there is no valid reason, recovery may proceed without a lock [A-R, C8 point 5]. Locking is a separate audited action [A-R, B.2 rule 6] and records staff identity, reason, case reference and timestamp, the four fields required by B.2 rule 5 and C9 point 7. The seven details of Y2.5 apply to relevant actions generally [A-H, Y2.5] (section 6). While locked, ownership changes are blocked and an offered transfer cannot be accepted [plan Part 1 section 12 and O3]. Revision 5 also lists claims and billing-contact changes as blocked and members and normal operation as unaffected [Proposed] |
| 4. Verify the applicant | Minimum evidence: a business document, matching government photo ID, a call-back to the registered phone, and verified access to the proposed email [A-R+O, B3]. *Revision 5 [Proposed] qualification:* the call-back is never to a number the applicant supplies now. Revision 5's additional items remain **[Proposed]**: (e) for migrated customers the source record from the old system; (f) a short written account of how access was lost; and extra S6 evidence. When these are mandatory is not stated. All evidence is recorded |
| 5. Check the business | Staff confirm the applicant is not an employee [Proposed, Revision 5 B.2 step 3]. An employee is not eligible unless they meet the evidence as a proprietor, partner or director [Proposed]. Confirming the "members list" depends on where employee data lives (section 13) |
| 6. Notice | After initial business and evidence verification, the existing 7-day notice goes to the current Business Admin, whether or not a lock is active. There is **no separate ownership-lock notification** and no Admin lock notice [A-R+O, B4; A-R, C12]. The 7-day period starts when the notice is successfully sent. "Successfully sent" is **[Design]**. The notice is sent even if the Admin's email is suspected lost [Proposed]. It carries an "I object" action for the current Admin with a verified session [Proposed; wording changed from "any current Owner"] |
| 7. Decide | One authorised staff member is sufficient to investigate and approve a recovery action; no second reviewer is required [A-H, Y2.2, Y2-A]. X4 states the same for "one specifically authorised Ops reviewer" [A-R, X4 point 6]. The Ops Admin may approve a case they opened [A-R, X4]. The applicant cannot approve their own case [Proposed, carried from Revision 5]. The approval is recorded with the seven details |
| 8. Issue | One authorised staff member may investigate, approve the recovery action and issue the recovery claim; one authorised staff member is sufficient [A-H, Y2.2]. On approval the claim is issued to the verified new email [Proposed, Revision 5 B.2 steps 5 and 6]. **Staff never directly assign or transfer business ownership** [A-H, Y2.1]. An Ops-led recovery appoints one new Admin [A-R, Admin rule 7]. Y2.1's final sentence states "The new Owner must complete the secure claim process"; applying it to the new Business Admin is **[Decision M: Admin application unresolved]**. Claim limit, recipient eligibility and same-email handling: **[DECISION REQUIRED, C7]** |
| 9. Replace | When the claim is consumed **[Derived]**, the new Admin is appointed and the previous Admin's central membership is disabled by default (C3 says "following recovery" and does not fix the moment; consumption as the moment is derived from Admin rule 7 and the claim flow), with the record and historical Admin role retained and no active Admin authority. Removal only for confirmed compromise or abandonment [A-R, C3, B2]. Whether staff do this directly or through a predefined process is **E-29, open**. Any pending transfer started by the previous Admin is revoked automatically (C13) |
| 10. Close | Staff close the case [Proposed, Revision 5]. A lock that was set is **not** cleared by closing and is **never** cleared automatically. Clearing a lock requires the explicit `clear ownership lock` permission (the Ops Admin has it by default); a specifically authorised reviewer holding it may clear the lock whether or not they set it, with an audit record of staff identity, reason, case reference and timestamp [A-R, C9]. Whether a case may close while its lock is still set is not stated (section 13) |
| 30-day checkpoint (recovery path) | Begins when the case is opened. If an objection changes the recovery case into a dispute, the original clock continues and does not restart [A-R, C12 point 6]. At 30 days the case is escalated to AJ. No automatic closure or unlocking [A-R+O, B5; A-R, C12 point 7]. Whether the checkpoint applies to a case initially opened as a dispute or a security case is **[UNDECIDED]**. What AJ may do at escalation is not stated (section 13) |

**If the previous Admin regains access** [A-R, C3, C4; Revision 5 B.4 superseded where it conflicts]: C3 states that the disabled membership grants no active Admin authority [A-R]. *[Proposed, Revision 5 B.4]* they can sign in but have no access to the business through the disabled record. They may return as an employee only through the current Admin's normal employee invitation process, with role and permissions assigned in the product workflow. They cannot become Admin again by a normal transfer because they already have a Platterly account (C4). C3 names no staff reinstatement route (the Revision 5 staff reinstatement wording is superseded where it conflicts). **During the 7-day notice**, an objection by the current Admin moves the case to disputed: no claim can be issued, the lock (if any) stays, and staff review [Proposed].

**Controls against an employee or stranger claiming ownership** [Plan Part 3 section 3: claims are staff-issued, email-bound, secret plus verified matching email] [Proposed: the remaining controls]: employees cannot create claims. Evidence must show control of the business, not of the workplace. Rate limits on case opening and claim issue. Every step is audited. [Historical, plan Part 3 section 4 (D3 matrix)] "No self-promotion; Admin cannot touch Admin or Owner." Whether C5 (Business Admin is the only central authority role; no central Manager or Member roles) supersedes, narrows or retains this control is not decided (section 13 item 36).

### 5.6 Dispute workflow
Carried from Revision 5 with updates.

| Item | Content |
|---|---|
| Triggers | Two claimants; the Admin objects to a case or transfer; a staff finding of fraud or compromise; a party contacts support [Proposed, Revision 5] |
| Actors | Support staff (open); specifically authorised Ops staff (review); the parties. Who decides a contested dispute is unresolved (below) |
| Steps | 1. Support staff open a dispute case. 2. Specifically authorised Ops staff review it [A-R, B.2 rule 3]. Only specifically authorised Ops staff may activate `ownership_locked` [A-R, B.2 rule 4]. Whether a dispute may or must result in a lock is not stated by an approval (section 5.1; section 13 item 28). C8's valid-reason condition is stated for recovery and is not extended to disputes here. 3. **Pending claims and transfers are not paused or extended; they expire normally** (D1). 4. Evidence from each party [Proposed]. 5. *Recovery cases:* the existing 7-day notice goes to the current Business Admin after initial business and evidence verification, with or without a lock, and starts when successfully sent [A-R, C12; A-R+O, B4]. *Disputes:* the plan documents a "7-day notice to all current owner emails" for the "ownership dispute or lost access" procedure (Part 1 section 12) [plan Part 1 section 12, Owner-worded]; Revision 5 3.5 step 4 carried it for disputes [Proposed]. C12 does not state a separate dispute notification, so whether and to whom a dispute is notified is not decided. 6. **Decision authority, in three layers.** *Approved (recovery only):* one authorised staff member suffices to investigate and approve an ownership **recovery** action, with no second reviewer [A-H, Y2.2, Y2-A]; X4 states the same for "one specifically authorised Ops reviewer" [A-R, X4 point 6]. *Proposed (disputes):* Revision 5 section 3.5 step 5 applied the same single-reviewer rule to a dispute [Proposed]. *Unresolved (contested disputes):* who decides a dispute in which both parties claim ownership. Revision 5 B.4 kept such a dispute locked "until AJ rules" [Proposed]. **[DECISION REQUIRED]** 7. Outcome [Proposed, Revision 5]: recovery claim to the confirmed party, or no change, or removal of the Admin through the dispute procedure (conflicts with exactly one Admin, section 13); any lock is cleared by an authorised reviewer holding the permission (C9) |
| Further Revision 5 items | [Proposed] a `withdrawn` outcome; the parties are told the outcome; staff contact an objector through the registered phone; no party can decide their own case |
| Unchanged | Billing and data are untouched; members keep working [plan, as stated in Revision 5] |
| Not addressed by an approval | Whether a **dispute** requires a lock. C8 is stated for recovery. Revision 5 assumed an immediate lock for disputes (section 13) |
| Audit | `ownership.case.opened` (proposed name), `ownership.lock.set`, `.cleared`, `ownership.recovery.evidence_recorded`, `.notice_sent`, `.objection_raised`, `.approved`, `.rejected`, `.closed`, case escalation events |

### 5.7 Refusals
Approved principles [A-R+O, R-C1]: standard refusal messages; a generic claim-link failure message; a random support reference ID; restricted investigation information. *Plan-documented* (Revision 5 C.0): a refusal does not reveal whose business ("without revealing whose"; "count only"). *[Proposed, Revision 5 2.C.2]*: the reference id is not derived from any business, user or email; every non-correctable refusal shows a support route; reveal only what the actor already knows. Every refused action creates an audit record, never logging secrets, tokens, passwords, OTPs or hashes [A-R+O, R-C2]. Relevant other-organisation ids may be recorded internally, with restricted staff access and audited access [A-R+O, R-C3]. **Exact customer-facing wording is reviewed and approved during implementation, before release [A-R, R-C4]; Revision 6 contains no final message text.**

Also carried from Revision 5 as **[Proposed]**: a business-rule failure never produces a server error (the plan's concurrency test CL-1 expects "limit reached" with no server error); notifications about a refusal go only to parties entitled to know; a transfer refused at acceptance moves to `refused`.

The refusal-code catalogue of Revision 5 section 2.C.1 is carried as **[Proposed]** with these Revision 6 notes:
| Revision 5 code | Revision 6 note |
|---|---|
| `SLOT_TAKEN_SELF`, `SLOT_TAKEN_TARGET` | Keep for claims and O1. For normal transfers the cause is now "the nominee already has a Platterly account" (C4). Revealing that fact conflicts with the no-enumeration principle **[Design]** |
| `OWNER_CAP` | Superseded (no cap of three). Replacement depends on C7 **[Design]** |
| `LAST_OWNER` | Superseded in form by the single-Admin invariant **[Design]** |
| `CLAIM_UNAVAILABLE`, `UNVERIFIED_EMAIL`, `OWNERSHIP_LOCKED`, `HOLD_ACTIVE`, `FRESH_AUTH_REQUIRED`, `NOT_PERMITTED`, `TRANSFER_PENDING`, `RATE_LIMITED`, `CONFLICT_RETRY` | Carried |
Staff-held-information rules, aggregation of repeated refusals (a staff alert) and retention follow Revision 5 section 2.C.3 [Proposed]; audit retention is not decided (E-32).

---

## 6. Audit requirements
Every relevant staff, customer or system action records **all seven details** [A-H, Y2.5, as listed in Revision 5 section 0E.2]: actor category; exact actor or system-process identity; action performed; affected business; date and time; reason, or the associated support or recovery case, where applicable; approval details, where applicable. Initiator and executor are recorded separately, and a decision is never attributed to the system merely because the system executed it [A-H, Y2.6]. Staff viewing of customer business information is recorded even when nothing changes: staff identity, business, date and time, case, reason [A-H, Y2-D].

Additional records required by the 2026-11-05 approvals [A-R]:
| Record | Required content |
|---|---|
| Case creation | A separate audited action from locking [A-R, B.2 rule 6]; it carries the required audit details [A-R, C8 point 7]. C8 does not say that these are the seven details of Y2.5; that they are is **[Derived]**. Y2.5's general rule for relevant actions applies in any case [A-H, Y2.5]. The four-field list (staff identity, reason, case reference, timestamp) is approved for the lock action only (B.2 rule 5) |
| Lock activation | Staff identity, reason, case reference, timestamp |
| Lock clearing | Staff identity, reason, case reference, timestamp |
| Permission grants and revocations, and sensitive actions | Audited (X4 point 5) |
| Offer revocation | Reason, case reference, audit trail (C10); the system-triggered revocation (C13) |
| Expiry during a lock | Recorded as expired (D1) |
| Refusals | One audit record per refused action (R-C2) |

The flag to the Ops Admin at a missed review-start target (C11) and the escalation to AJ at 30 days (C12) are approved. That these events are themselves separately audited is not stated by C11 or C12; the general seven-details rule applies to relevant actions (Y2.5). [Proposed event names]

The audit table design, actor references (foreign key versus text), case reference source and the treatment of the direct-database creation of the production Ops Admin are **[Design]**. The identity of an unauthenticated or unknown actor is **E-26, open**.

---

## 7. Ops staff authority (X4)
| Rule | Content (sources cited in each row) |
|---|---|
| Ops Admin | Exactly one per environment. Has all Ops permissions by default, including recovery review, ownership locking, investigation and recovery approval. Grants and revokes specific permissions for other Ops staff |
| Other Ops staff | Hold only the permissions explicitly assigned |
| Support staff | May open recovery, dispute and security cases by default. Case opening does not grant review, locking, investigation or approval |
| Reviewers | For recovery review and approval, one authorised Platterly staff member is sufficient to investigate and approve an ownership recovery action; a second reviewer is not mandatory [A-H, Y2-A]. Y2.2 also establishes that one authorised staff member is sufficient to investigate and approve a recovery action and issue a recovery claim [A-H, Y2.2]. For Ops recovery review and approval, one specifically authorised Ops reviewer is sufficient [A-R, X4 point 6]. For revoking a pending offer, one authorised Ops reviewer is sufficient and no second approval is required [A-R, C10 point 8]. Decision authority for contested disputes is not approved (sections 5.6 and 13) |
| Self-review | The Ops Admin may approve a recovery case they opened; no self-review restriction is imposed |
| Bootstrap | Development continues with the existing Ops Admin account. At go-live AJ creates the dedicated production Ops Admin directly in the production database; not through invitation, registration or an appointment workflow. No other Ops Admin account during development. This approves the approach only; no database change is authorised now |
| Explicit permissions named by approvals | `clear ownership lock` (C9) and `revoke pending offer` (C10). Others are named as Ops capabilities: open case, review, lock, investigate, approve recovery [A-R, B.2, B1, X4]. Y2.2 names "authorised staff" for investigating, approving and issuing a recovery claim; no approval makes issuing an Ops-only permission |
| **Open** | Ops Admin succession (who appoints a replacement, how it changes, what happens if unavailable or compromised): **[DECISION REQUIRED]**, section 8 |
| **[Design]** | How Platform Core knows who staff are and links to the separate Ops staff login (`F4.2.1`); where permissions are stored and enforced; the permission catalogue's granularity; staff fresh authentication; enforcing "exactly one Ops Admin per environment"; recording the direct-database creation |

---

## 8. Unresolved, deferred and risk items

### 8.1 C7: Admin claims [DECISION REQUIRED, AJ]
No approval exists. **No policy is recommended or invented here.** The historical three-claim limit is **not restored**; it is superseded by the single-Admin model [Historical].

**Source of this five-item list:** AJ's 2026-11-05 end-of-day handover message in the project conversation. It is not saved as a handover file, and no file citation is given. The decision register's section 5.1 C7 entry names three matters (items 1 to 3) and is not changed. Items 4 and 5 appear in the register only in its historical C7 table, which marks both as not inferred either way. The discrepancy is recorded in section 13 item 38 and is not reconciled here. All five matters remain unresolved.

| # | Matter requiring AJ's decision |
|---|---|
| 1 | **Pending-claim limit** for a business (first-Admin, migrated and recovery claims) |
| 2 | **Ordering against a pending ownership transfer** when a claim and a transfer could both complete (C13 covers only the case where a completed recovery or dispute decision revokes a pending transfer) |
| 3 | **Recipient eligibility** for a claim (C4 is scoped to normal transfer only) |
| 4 | Whether **one pending claim per `(businessId, boundEmail)`** survives |
| 5 | Whether **same-email supersession** (issuing a second claim to the same email supersedes the first) survives |

**Historical rules (context only)**: Foundation Plan Part 1 section 2 ("Claim uniqueness and competing claims": one `pending` claim per `(businessId, boundEmail)`; at most 3 pending owner claims; a second claim to the same email atomically supersedes the first; refused if Owners plus pending would exceed 3; the 3-Owner cap re-checked at consumption), Part 3 section 0b item 1, tests CL-1 to CL-8, and the `pending_slot` CHECK of 1 to 3. The capacity of three is superseded. Items 4 and 5 are not inferred either way. Full quotations are in register section 5.1.

### 8.2 Other open matters [DECISION REQUIRED unless stated]
| Item | Status |
|---|---|
| **Ops Admin replacement and succession** | Open; kept separate by AJ |
| **Alternative notification route** for a potentially compromised Business Admin email | Open; kept separate by AJ; linked to A3. No route is invented |
| **E-29** | Whether staff disable or remove the previous Admin directly or through a predefined process. Open |
| **E-32** | What counts as one staff "view", retention of audit records, protection. Open |
| **Decision M** | The relationship between the central "Owner" of earlier documents, Y2.3's "Owner-level authority" and Business Admin authority. Open (section 13) |

### 8.3 Deferred [Deferred]
| Item | Content |
|---|---|
| **A3** | "Defer the independent out-of-band notification mechanism. Leave it unresolved for later design. Do not introduce a new recovery-contact field or assume the Ops billing contact is suitable" |
| **E-25 / Y2.3 detail** | Detailed support workflow, access-management arrangements, permanent or temporary access policy, durations |
| **O4** | Blocked on E2 |
| **Exact refusal wording** | Approved at implementation (R-C4) |

### 8.4 Security risks retained until AJ resolves them [Risk]
| ID | Risk |
|---|---|
| **E-04** | A compromised Admin account can hand over the business as soon as the nominee accepts. With exactly one Admin per business this applies to every business. There is no hold (A2) and no out-of-band notice (A3 deferred); notices go to the same inbox and are **not** a mitigation. The staff revocation routes (X5, C10) and the automatic revocation (C13) help only before acceptance. Nothing in this draft resolves it |
| **E-14** | One authorised staff member can investigate, approve and issue a recovery alone [A-H, Y2.2, Y2-A]. Under X4 the Ops Admin can also open, review and lock the same case and may approve a case they opened [A-R, X4]. Mitigations that remain: permissions restricted to explicitly authorised staff, a full audit with approval details, audit of every staff view (Y2-D), the claim process itself, and the 7-day notice, which does not help if the Admin's inbox is the compromised one (E-04). No two-person requirement is introduced |
| **E-23 consequence** | Employees and other members cannot cancel an offer (X5 point 3). They can only ask staff to open a dispute. There is no automatic path |

---

## 9. Edge-case register (updated)
Status key: **C** covered by an approved rule; **P** covered by a rule proposed here; **U** unresolved; **S** superseded.

| ID | Case | Revision 6 status |
|---|---|---|
| E-01 | Duplicate ownership claims | **U, C7.** The three-claim capacity is superseded by the single-Admin model. Whether one pending claim per `(businessId, boundEmail)` survives is unresolved (C7 item 4) |
| E-02 | Concurrent transfer requests | C: one pending transfer per business, shared `lockOrganisation`. The cap re-check is superseded. Interaction with a pending claim: C7 |
| E-03 | Former employee attempts recovery | P: evidence must show proprietor, partner or director status; refused at the business check |
| E-04 | Admin account compromised | **U / Risk (section 8.4)** |
| E-05 | Business already linked to a product | Revision 5 status C. Revision 6 status P / Design: the rule that a consume inserts slots for every linked product was a Revision 5 mechanism and depends on the per-product D15 design (section 10) |
| E-06 | Multiple employees claim ownership | **Partly addressed; no blanket supersession.** *Exact approved rules:* Admin rule 3 (no co-Admins or multiple central Admins), C5 point 2 (no central Manager or Member roles), C5 point 4 (central membership records a relationship and grants no product permissions), C6 point 2 (employees do not require central business membership), C6 point 3 (product employee invitations do not automatically create central organisation membership) [A-R]. *Historical Revision 5 E-06 wording, not restated as current:* "Employees cannot create claims; staff issue claims; independent claims for different emails are each consumed by their own holder; cap 3; more than 3 candidates: AJ chooses 3, the rest become Admin (O4 text)". *Editorial clarification, not Revision 5 text:* "Admin" in that O4 wording is the old second-tier role (section 4.3). How those claim mechanics apply is unresolved: pending-claim and per-email matters are C7 (section 8.1), and the O4 text is section 13 item 35. *Contested-claim workflow:* "Contested claims go to workflow 4" [Proposed, Revision 5] |
| E-07 | Employee leaves | S in part: employees are product-managed (C6). How the single Admin may leave the business is not stated by an approval. The plan rule that the last Owner can neither leave nor be removed is [Historical] (plan Part 1 sections 2 and 12); its restatement under the single-Admin model is [Design/Open] |
| E-08 | Admin loses access to the email | P: recovery S3 and S4 |
| E-09 | Existing Caterly ownership conflicts | U until F8 and E2 (unchanged) |
| E-10 | Target already holds a slot | **O1:** covered, D13 slot check [A-H]. **Normal transfers:** C4 [A-R]. A nominee must be entirely new to Platterly and must not already have a Platterly account. Any existing Platterly account makes the person ineligible, regardless of which business they belong to, including existing employees and Managers of the same business. **Claims:** D13 [A-H] approves one account per product per identity enforced across claims, pending the C15 reconciliation; recipient eligibility beyond that is C7 item 3 and unresolved |
| E-11 | Email change during a pending claim or transfer | C / P: the 72-hour hold; handling of an offer to a changed email is proposed (revoked and re-offered after the hold) |
| E-12 | Claim email typed wrong by staff | **U** (unchanged) |
| E-13 | Two businesses, different products, one person | C (X1) |
| E-14 | Staff compromised or acting alone | **U / Risk (section 8.4)** |
| E-15 | Dispute outlasts claim expiry | S, resolved by D1: items expire normally; a fresh request follows |
| E-16 | Deletion while a case is open | P: block deletion while a case or lock is open (see section 13) |
| E-17 | Last Owner disabled | S in form: the floor-and-cap rule is superseded by exactly one Admin [A-R]. How a disabled sole Admin counts under that rule is [Design] (historical W1 plan section 8B: the floor counted active Owners only) |
| E-18 | Initiator loses authority while an offer is pending | C for loss through a completed recovery or dispute decision (C13: system revokes). Step-down variants are superseded |
| E-19 | Migrated customer's real owner differs | U until E2 |
| E-20 | Dispute during break-glass | C: no ownership action in break-glass |
| E-21 | Authority obtained by another route | **Partly C.** Admin-specific: the routes O1, normal transfer and recovery appointment [A-R, Admin rules 2, 6, 7]; delegated responsibilities do not make employees Admins [A-R, Admin rule 5]; staff cannot assign or transfer ownership [A-H, Y2.1]. X2 and X3 are worded for the Owner; whether their restrictions apply to the Business Admin is **U, Decision M** |
| E-22 | Staff revoke outside an authorised case | C: refused. Needs `revoke pending offer` (C10) |
| E-23 | Co-Owner wants to stop an offer | **S as written** (no co-Admins); consequence retained as a risk (8.4) |
| E-24 | Existing Owner re-issues an expired claim | **S by derivation only.** D1 point 5 requires a fresh request but does not say who makes it, and no approval addresses the "existing owner" route. Under the single-Admin model an existing Admin has no claim to re-issue (an inference). Whether staff re-issue creates a new claim that supersedes the old depends on **C7** |
| E-25 | Staff access to customer information | Audit decided (Y2-D); policy **deferred** |
| E-26 | Audit identity of an unauthenticated actor | **U** |
| E-27 | Meaning of "lock access" | **U.** Approved Y2.1 lets staff "lock access when there is a credible security concern"; B.2, C8 and C9 define only the ownership lock (`ownership_locked`). Whether staff may also disable a user, a membership or a product link is not stated (Revision 5 E-27) |
| E-28 | Staff revoking a suspicious offer versus X5 | C: reconciled (Y2-B, C10) |
| E-29 | Previous Admin's membership in a recovery | **U**: staff directly or predefined process |
| E-30 | Ops as an actor | **U**: whether an action started in Ops is staff or system; whether views through Ops fall under Y2-D |
| E-31 | What is a genuine security concern | C: must identify a specific security issue related to the pending offer (C10 point 5) |
| E-32 | Recording staff views | **U** (open) |

---

## 10. Technical design items
No further policy decision is needed for these [Design]:

- **Single-Admin invariant**: counting only the active Admin; atomic replacement; unclaimed or adopted businesses; concurrency; the stored role vocabulary; representing a retained disabled historical Admin record; replacement of the cap and floor triggers.
- **Central membership and slots**: what the central record holds (employees need none, C6); the role of `membership_product_slots` under per-product D15; the interaction of a retained disabled record with the slot rule and with an employee invitation (C3); the account-exists check at offer and acceptance and account creation through the offer; the definition of "Platterly account".
- **Claims**: representing whatever C7 decides; the pending-slot mechanism and CHECK; claim statuses.
- **Case record**: type, case-opened time, review-start time, notice-sent time and delivery result, escalation flag, case reference source.
- **Audit**: actor references (initiator and executor), lock set and clear fields, permission events, system-triggered revocation, expiry during a lock, the direct-database Ops Admin creation, staff-view record.
- **Ops staff**: identity link to the separate Ops login (`F4.2.1`), permission storage and enforcement, permission catalogue, staff fresh authentication, "exactly one Ops Admin per environment".
- **Other**: Y3 (business fields on `organisations`), Y4 (organisation legacy ids), a lock start time, definitions of "business day" and "successfully sent", refusal codes, the Admin terminology in event and audit names, test-plan rewrite, Account UI rewrite (`F5.2.1`, `F7.2.2`, `F8.3.x`).
- **External dependencies**: D5 (email sender and templates), the plan's D1 and D2 (fresh-authentication enforcement), E1, E2, F4.

---

## 11. Dependencies and the `F3.2.1` gate

### 11.1 Dependencies on other specifications and plans
| Document or task | Dependency |
|---|---|
| Foundation Plan Part 1 sections 2, 3, 5, 12 | Claim definition, role mapping, ownership, dispute and recovery wording: to be reconciled in the future Revision 6 plan proposal (C15), which needs AJ's explicit approval before any plan change |
| Foundation Plan Part 3 sections 2, 3, 3a, 3b, 4 | Decision gates, O1 to O4, invitations, D15, permission model: to be reconciled in the future Revision 6 plan proposal, which needs AJ's explicit approval before any plan change |
| Foundation Plan Part 3 section 6 (`F3.2.1` to `F3.2.3`, `F5.1.1`, `F5.1.2`, `F5.2.1`, `F5.3.1`, `F5.3.2`, `F7.2.2`, `F8.3.x`) | Scope and dependencies change; Account team screens are rewritten for the one-Admin, product-managed-employee model. To be reconciled in the same future proposal |
| W1 plan sections 2, 4, 6, 8B, 8C | Baseline decisions C2, C3, C4, C6 to C10 [A-H]; the multi-owner invariant design and tests are superseded |
| Gate B-1 record | D3, D13, D15 to be annotated by the plan proposal; scope S2 and boundaries unchanged |
| `F4.1.2`, `F4.2.1` | Account recovery (S2); Ops staff login stays separate |
| D5, plan D1 and D2, E1, E2 | Email, fresh-authentication enforcement, migrated customers |

**C15 is an approved approach, not an approval of any amendment.** It requires a complete future Revision 6 plan proposal covering all approved decisions, presented to AJ for explicit approval before the plan or related records change. It replaces none of the Revision 5 contradictions below, and the plan wording stays unchanged until that approval.

#### 11.1a Plan wording awaiting reconciliation (Revision 5 section 0B)
| 0B item | Plan wording | Addressed by approved decision | Plan wording status |
|---|---|---|---|
| 1, 2 | "invitation as Owner" | X2; single Admin | Unchanged; amendment pending |
| 3 | transfer started by "current owner or staff with audit" | X3 | Unchanged; amendment pending |
| 4 | re-ownership "not a claim" vs recovery ending in a claim | Not directly decided. Recovery appoints one new Admin (Admin rule 7) by a recovery claim (Y2.1, Y2.2) | Unchanged |
| 5 | old owner "becomes Admin unless removed" | C2 | Unchanged; amendment pending |
| 6 | matrix has no cancel or decline row | X5, C14 (rule approved; matrix row not written) | Unchanged |
| 7 | staff and offers | X5, Y2-B, C10 | Unchanged |
| 8 | "existing owner re-issues" | D1 point 5; single Admin | Unchanged |
| 9 | "second reviewer where possible" | Y2-A, X4 (recovery) | Unchanged |
| 10 | X5 as "not approved wording" | X5 approved | n/a |

### 11.2 `F3.2.1` prerequisites (C16) [A-R]
`F3.2.1` waits only for these, not for acceptance of this whole specification. Unrelated open policy questions do not automatically block it.
| # | Prerequisite | Outstanding work |
|---|---|---|
| 1 | Revision 6 Platform Foundation Plan reviewed and explicitly approved | The plan proposal is not yet drafted |
| 2 | Single-Business-Admin database invariant technically designed and approved | Section 10 |
| 3 | Organisation membership and product-slot rules finalised | **C7** (policy) and the section 10 membership and slot items |
| 4 | Relevant schema and audit-table decisions approved | Audit table, case record, Y3, Y4, lock start time |
| 5 | Separate implementation and migration approvals granted | None given |

**Existing gates not changed by C16.** *Approved restriction:* W1 baseline C10 (no database creation, data copy or migration without separate approval) [A-H]. *AJ standing requirements:* no Git staging, commit, push, fetch or pull, and no cluster or database creation, without approval (F5 handover) [A-H]; and the permanent release process (plan Part 1 section 15). *W1 plan safeguards:* section 7 (additive reviewed migrations, `down.sql`, a disposable test database, and migrating the dev database only on AJ's approval). *Technical safeguard:* the migration guard (`npm run check:migrations`) and its `-- data-safe-approved:` line; whether the `F3.2.1` migration needs the line is unknown until the migration is written [Design]. These are listed for traceability and are not additional C16 prerequisites.

### 11.3 Test plan additions [Proposed; none written]
| Area | Cases |
|---|---|
| Case and lock | Support opens a case and no lock is set; support cannot lock; an authorised reviewer locks with a reason and the audit row carries identity, reason, case reference and timestamp; case-open and lock are separate audit rows; recovery proceeds without a lock when no reason exists; a lock is never cleared automatically, including at 30 days; clearing needs `clear ownership lock` |
| Transfers | an initiating Business Admin starts a transfer [A-R, X5, C14]; a test that no other actor can start one is pending Decision M (X3 is Owner-worded) [Decision M: Admin application unresolved]; the nominee with any existing account is refused; a test that a standard invitation can never produce an Admin is pending Decision M (X2 is Owner-worded) [Decision M: Admin application unresolved]; cancel needs fresh authentication and decline does not; employees and members cannot cancel; staff revoke needs `revoke pending offer` and a case; an offer expires normally during a lock and is recorded; the system revokes an offer when the initiator loses authority through a completed recovery or dispute decision and the nominee cannot accept it; cancel racing accept; removal of the nominee before acceptance |
| Recovery | A missed review-start target flags the case for escalation to the Ops Admin; the 30-day checkpoint escalates to AJ and does not close or unlock; an objection that changes the case into a dispute does not restart the clock; the 7-day notice goes to the current Admin and starts when successfully sent; the previous Admin's record is disabled and retained |
| Claims | Redesigned once C7 is decided. The tests that assert "exactly 3" are superseded |
| Refusals, security, audit | One audit record per refusal; no secret in any audit row; the same message for every claim failure; the reference id leaks nothing; refusal timing and text do not distinguish an existing from a missing account; every staff view is recorded; no test assumes a second reviewer |

### 11.4 Acceptance scope and outstanding `F5.1.0` deliverables
Revision 6 may be accepted only as a decision-reconciled specification (section 0). `F5.1.0` is not complete and is not marked complete by this draft.
| Item | State |
|---|---|
| Reviewed test list | Outstanding `F5.1.0` deliverable. Not written and not reviewed. To be tracked as a separate follow-up task. Section 11.3 lists proposed additions only and is not a test list |
| The D15 "three open questions" | The plan's `F5.1.0` row refers to "its three open questions". Foundation Plan section 3b lists them: "**Questions for the `F5.1.0` spec (not yet decided):** whether a freed slot has any cooling-off period (proposed: none); how staff recover an owner who locked themselves out by choosing the wrong email (proposed: the dispute procedure, section 12); what message the invitee sees when refused. None of them changes the rule." **[Derived]:** the mapping of these questions to Revision 5's questions A (cooling-off), B (lock-out recovery) and C (refusal message), and to the register entries A1 [A-R+O], A2 [A-H], A3 [Deferred]; B1 to B5 [A-R+O] with B.2 and C8 to C12 [A-R]; R-C1 to R-C3 [A-R+O] and R-C4 [A-R], is this draft's own. It is not a statement in the Foundation Plan. The plan's third question is the message the invitee sees when refused, which is narrower than the refusal decisions R-C1 to R-C4; whether those decisions answer it is not stated. No approval states that any of the three is resolved, so each remains **unresolved** here, and related decisions do not resolve them |
| Invitation rules in the plan's `F5.1.0` row | One pending invitation per (organisation, `lower(email)`), and superseding competing invitations for the same product on accept. *Settled within the scope of C5 and C6:* decision register section 3 records "Central team membership for every employee; central employee invitations" (Foundation Plan F5.2.1, F7.2.2, F8.3.x; Revision 5 R2, R3, I1 and I2) as superseded by C5 and C6: no central Manager or Member roles; employees are managed in products; product employee invitations do not automatically create central membership [A-R, C5, C6]. *Not settled:* invitation rules that each product manages itself (each product manages employee membership, roles and permissions independently [A-R, C6 point 4]) have no decision here establishing their disposition, and C5 and C6 are not read as settling every product invitation question. Whether the plan's one-pending-invitation and supersede-on-accept rules survive in any form for `F5.1.0` is **unresolved** |
| `F5.1.0` task row | Not changed in the Foundation Plan |

---

## 12. Changes from Revision 5
| # | Change |
|---|---|
| 1 | Uses "Business Admin" for the central authority role per AJ's terminology instruction; "Owner" kept only in quotations and in Caterly's stored role. Decision M (the Owner/Admin relationship) is not decided here |
| 2 | Removed the cap of three Owners, pending-claim capacity, the last-owner floor, the step-down option, co-Owner wording and situation S1 (all marked historical) |
| 3 | Rewrote the transfer workflow: C4 nominee eligibility, C2 former Admin, C13 automatic revocation, C14 fresh authentication, D1 normal expiry, X5 and C10 revocation, X5 point 6 |
| 4 | Rewrote the recovery workflow: case opened by support without a lock (B.2), optional lock (C8), review-start targets (C11), notice timing and no lock notice (C12, B4), the 30-day checkpoint (B5), lock clearing (C9), previous Admin disabled and retained (B2, C3); Revision 5's staff reinstatement wording is superseded where it conflicts with C3 |
| 5 | Replaced "Platterly staff" with the Ops Admin, authorised Ops reviewers and support staff (X4); added the bootstrap approach |
| 6 | Replaced the freeze-and-extend rule with normal expiry (D1); E-15 resolved |
| 7 | Removed final refusal message text; kept the principles (R-C1 to R-C4) |
| 8 | Removed the Admin lock notice and its "yes" recommendation |
| 9 | Marked X5, A1, B1 to B5, C8 to C16 and R-C1 to R-C4 as decided; removed the "proposed" and "open" labels that applied to them |
| 10 | Replaced Revision 5's decision register (5.2, 5.2a) and `F3.2.1` gate analysis with references to the decision register and the C16 prerequisites |
| 11 | Added the C7 markers; restored no historical limit |
| 12 | Updated the edge-case register (section 9) |
| 13 | Added sections 3 (terminology), 8 (unresolved, deferred and risks), 10 (design items), 11 (dependencies, gate, tests), 12 (this list) and 13 (contradictions) |
| 14 | Dropped from this revision, each remaining in Revision 5: section 0 (brief versus approved documents); 0A to 0E (decision-recording tables, now in the register); 0B and 0D (contradictions with, and proposed amendments to, the approved plan wording). **C15 approves an approach and requires a future complete plan proposal; it does not replace or approve any 0B item or 0D amendment.** The plan wording is unchanged until AJ approves that proposal. Also dropped: the option analyses of Revision 5 sections 2.A and 2.B; the per-action initiator and executor table (Revision 5 section 0E.3); Revision 5 section 5.3 (`F3.2.1` dependency analysis, replaced by the C16 prerequisites); and the claim consume mechanics, which are implementation detail kept in Revision 5 and the W1 plan |
| 15 | Corrected after the independent accuracy review: A1 (R13) and X1 restored in R2; E-01, E-05, E-07, E-10, E-17 and E-27 corrected; evidence markers corrected; the §6 audit rows qualified; the §0 source list corrected; Y2.3 and Y2.4 restored without equating Owner and Admin; the Y2-A scope limited to recovery and the Y2-C scope limited to recovery claims; the shared case lifecycle restructured with the 30-day checkpoint in the recovery path; C16 rows 2 and 5 restored verbatim; the §11.2 database and migration note classified by source; the former Admin choice, the claim-issue notice, C15 and the 0B items restated; §13 extended |
| 16 | Second correction pass after a further accuracy review (findings M1 to M3 and m1 to m8, with follow-up checks): the Owner-worded decisions X2, X3 and Y2.1 are quoted unchanged and cited for the Business Admin only where an Admin-specific decision (X5, C13, C14, Admin rules 2, 5, 6, 7) states the behaviour, with a new marker for the remainder; O4 restored as historical plan wording; the Decision M exception added to §0; markers split for O3, C4 and C12; the C11 wording restored; terminology rows added for authorised staff and a business's own staff; the §4.4 rows separated into authorised staff and specifically authorised Ops staff; the claim flow separated into recovery claims and ordinary O2 and O4 claims; the acceptance checks classified; E-06, E-14, E-21 and E-24 restated; D15's "staff included" clarified; §13 items 35 to 37 added |
| 17 | Scoped correction pass authorised by AJ on 2026-11-05 after the acceptance review: Owner-worded X2 and X3 no longer stated as Admin rules in §5.4 Preconditions and §11.3 (Decision M markers); §5.6 item 2 no longer implies that dispute reviewers may lock; D13 restored as an approved [A-H] rule for claims in §5.3 and E-10, pending C15; acceptance scope limited to a decision-reconciled specification (§0, new §11.4); marker, citation and attribution fixes (R1, R2, R4, R7, R11, R12, §4.3 to §4.4, §5.3 to §5.6, §6, §7); the R+O Business Admin clarification quoted in §3 without resolving Decision M; derived items marked; historical "Admin" in the O4 wording clarified; table names and statuses marked proposed; D7 traceability; §12 row 14 references. The decision register is not changed, and the register C7 row alignment is deferred (§13 item 38). Revision 6 remains a draft |

---

## 13. Contradictions and gaps requiring future review
These are kept visible. None is resolved here and none is a new decision.

| # | Matter |
|---|---|
| 1 | **Approved documents against the single-Admin model**: D3 (four central roles, Admin limits), D13 (O1 to O4 written around Owners and a cap), D15 (central slot for all roles, staff included), plan Part 1 sections 2, 5 and 12, W1 plan sections 4, 6, 8B and the multi-owner tests |
| 2 | **Central employee membership and invitations** (I1, I2, `F5.2.1`, `F7.2.2`, `F8.3.x`) against C5 and C6 |
| 3 | **Retained disabled Admin record** (C3) against the W1 rule that counts non-removed owners toward a cap, and against the slot rule and invitation refusal when that person is later invited as an employee |
| 4 | **C4 acceptance mechanics**: the nominee has no account when the offer is made but must create one to accept; the plan checks the nominee at start and at acceptance |
| 5 | **C4 and the no-enumeration principle** (R-C1): refusing an offer because an account exists reveals that fact |
| 6 | **C4 is scoped to normal transfer.** Whether a recovery claim to a previous Admin's new email, or to someone with an existing account, is allowed is part of C7 |
| 7 | **"Owner removal is dispute-only"** (plan Part 3 section 4) against B2's removal exception for confirmed compromise or abandonment |
| 8 | **C8 and disputes**: C8 says a lock is not mandatory for every recovery; it does not say whether a dispute needs one. Revision 5 assumed an immediate lock |
| 9 | **Objection with no lock**: Revision 5's "the lock stays" assumed a lock exists |
| 10 | **Closing a case with a lock still set**: C9 says locks are never cleared automatically, and the Revision 5 closure step cleared the lock |
| 11 | **Pending transfer or claim during an unlocked recovery**: only a lock blocks acceptance and consumption |
| 12 | **Escalation to the Ops Admin** (C11) when the Ops Admin is also the reviewer, or is unavailable (succession is open) |
| 13 | **Who issues non-recovery claims** (first Admin, migrated customers) and under which permission: the plan says "staff or Ops"; Y2 and X4 speak of recovery |
| 14 | **The "members list" check** (5.5 step 5) assumes central data about employees that C6 removes |
| 15 | **Business Admin transfer by the Admin when the business has employees**: C4 requires an entirely new person. This is a consequence of the approval, listed for awareness |
| 16 | **Other "Owner" wording** in names and tags (`owner.changed`, audit and refusal codes) |
| 17 | **Draft status caveat**: Revision 5 recorded the 2026-11-04 decisions "for review" and its status table says AJ had not decided any proposal; the register records AJ's later treatment of them as authoritative |
| 18 | **Evidence gaps**: A1, B1 to B5, R-C1 to R-C3 and C2 rest on a relayed summary with no recoverable original wording or date |
| 19 | **The handover and Revision 5 are local or untracked**; the register is also untracked |
| 20 | **R8 against the no-Admin states**: "exactly one Admin" and a business with no Admin awaiting a claim (O2, O4) |
| 21 | **Dispute outcome "removal of the Admin"** (plan Part 3 section 4; Revision 5 3.5) against exactly one Admin and recovery appointing one new Admin: no stated state for a business left without an Admin |
| 22 | **Who may open a case**: support staff may by default (B.2, X4); X4's Ops Admin approving "a case they personally opened" implies others may; who else is not stated |
| 23 | **Decision authority**: Y2.2, Y2-A and X4 approve a single reviewer for an ownership recovery action, and C10 for revoking an offer. Their application to dispute decisions is a Revision 5 proposal. Who decides a contested dispute is **[DECISION REQUIRED]** |
| 24 | **E-27 against Y2.1**: Y2.1 lets staff "lock access when there is a credible security concern"; B.2, C8 and C9 define only `ownership_locked` |
| 25 | **Y2-C scope**: it names recovery-claim expiry only; expiry of other claims is not named |
| 26 | **A lock blocks claims, but a recovery relies on a claim**: Revision 5 lists claims among the blocked actions and `OWNERSHIP_LOCKED` refuses O2, while a recovery issues an O2 claim that the new Admin must consume. Whether a staff-issued recovery claim is exempt, or the lock must be cleared first, is not stated |
| 27 | **Lock persistence and AJ's authority at 30 days**: locks are never cleared automatically (C9) and cases never close or unlock automatically at the checkpoint (C12, B5); what AJ may do on escalation, whether it recurs, how it is delivered and whether it is audited are not stated |
| 28 | **Lock timing against disputes**: Revision 5 set an immediate lock for a dispute; C8 puts the lock at the start of review for recovery; whether a dispute or security case may or must lock is not stated (see also 8 and 9) |
| 29 | **D1 expiry against case duration**: offers (7 days) and claims (14 days) expire normally during a lock, but a case can run to 30 days or more; "a fresh request" depends on how a replacement claim works (C7) |
| 30 | **Business deletion while a lock is set**: Revision 5 proposed blocking deletion while a case or lock is open; with locks never cleared automatically that block has no end unless someone clears the lock; deletion is staff-only and manual |
| 31 | **Missed review-start target**: C11 approves a flag for escalation to the Ops Admin and says no new backup authority. What the Ops Admin then does, whether the flag recurs and whether it is audited are not stated. C11's three categories are not stated to match the three case types |
| 32 | **30-day checkpoint scope**: C12 states it for a case that an objection changes into a dispute; applying it to a case initially opened as a dispute or a security case is undecided |
| 33 | **Decision M (Owner/Admin relationship)**: Y2.3's "Owner-level authority" and C5's "Business Admin" are not equated here. The register's §3 row describing Decision M as "Moot under the single-Admin model" is Claude's characterisation, not an AJ decision; a separately gated correction to it has been proposed and not applied. This draft's §3 "Business Admin" row and §12 row 1 are qualified so that they do not equate the two. AJ is asked whether the Owner/Admin relationship is settled by the Business Admin clarification and the terminology instruction, or remains open. The clarification's sentence "There is no separate central Owner role above or below Admin" is relayed evidence [A-R+O], quoted in section 3; it is not treated as a resolution |
| 34 | **Whether closing a case is ever automatic**: no automatic closure is stated at the 30-day checkpoint (C12, B5) and on a missed review-start target (C11); a general rule is not stated |
| 35 | **O4 against exactly one Admin**: the plan's O4 (blocked on E2) allows one or several confirmed owners, maximum 3; AJ confirms each owner and, if more than 3, chooses 3 and the rest become Admin (the old second-tier role, section 4.3); one O2 claim per confirmed owner, with claim uniqueness per (businessId, boundEmail), at most 3 pending per business, and the 3-Owner cap re-checked at consumption. These mechanics are historical plan wording, not current approved rules, and O4 is not described as superseded. The single-Business-Admin model allows one Admin (Admin rules 1 and 3). How O4 applies to a customer whose source records show several owners is unresolved. It ties to all five C7 matters (pending-claim limit; ordering against a pending transfer; recipient eligibility; per-email uniqueness; same-email supersession), which remain open |
| 36 | **Self-promotion control**: the plan's approved matrix states "No self-promotion; Admin cannot touch Admin or Owner" (Part 3 section 4); Revision 5 B.5 repeats it as an approved control. C5 leaves one central role. Whether the control is superseded, narrowed or retained is unresolved; it is preserved here as history |
| 37 | **Owner-worded decisions with an unresolved Admin application**: X2's invitation restriction, X3's exclusivity and Y2.1's claim-process sentence are approved with the word "Owner" and are cited for the Business Admin at §4.1 R7, §4.2 (Admin authority row), §5.4 (Actors, Preconditions and step 1), §5.5 step 8, §9 E-21 and the §11.3 transfer tests, marked [Decision M: Admin application unresolved]. Later A-R decisions state the Admin wording for the initiator, cancel, fresh authentication, notice and appointment rules (X5, C13, C14, C12, Admin rules 2, 5, 6, 7). Whether the central Owner and the Admin are the same authority remains Decision M |
| 38 | **Register C7 row against this draft (deferred)**: register section 5.1 names three C7 matters (pending-claim limit; ordering against a pending transfer; recipient eligibility). This draft lists five, adding per-email uniqueness and same-email supersession, which AJ's 2026-11-05 handover message in the project conversation lists (it is not saved as a file) and which the register's own historical C7 table marks as not inferred either way. The five-item list is supported by that conversation message; all five matters remain unresolved. Aligning the register needs separate approval to amend it and is deferred. The register is not changed |

---

## 14. Not carried and not changed
Revision 5 itself is unchanged. The long option analyses, the contradictions-with-plan tables (0B) and the proposed plan-wording amendments (0D) are not repeated; the plan reconciliation is the future C15 proposal. This draft does not accept `F5.1.0`, does not authorise `F3.2.1`, and changes no code, schema, migration or configuration.
