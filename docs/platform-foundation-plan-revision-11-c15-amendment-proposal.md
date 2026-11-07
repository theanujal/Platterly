# Foundation Plan Revision 11 Amendment Proposal (C15)

**Status history (updated 2026-11-06).** (1) AJ formally accepted this proposal as a **proposal only** on 2026-11-05. (2) AJ separately authorised applying it to the Foundation Plan on 2026-11-05, and the application was made the same day. (3) The proposal was corrected on 2026-11-06 on AJ's authorisation (the P1 s2 "Expired" row and its section 12.1 row; the fresh-authentication wording in sections 4.2, 5.3, 8.2 and 10.1 to match D2.4). (4) AJ then explicitly approved the **resulting amended Foundation Plan (Revision 11, `docs/platform-foundation-plan.md`)** on 2026-11-06 as the artifact satisfying C16 prerequisite 1. Proposal acceptance, authorisation to apply it, and approval of the resulting plan are three separate steps; **this proposal file itself is not the approved plan.** The body below is the proposal as drafted and is kept as the record of what was proposed; where its wording says "not approved" or "for AJ's review" it describes its status at drafting time. This document changes no existing document, authorises no implementation, schema, migration, database, service or Git operation, and does not authorise `F3.2.1`.

Prepared 2026-11-05 under AJ's approval of the C15 drafting task. Working title (retained by AJ): "Foundation Plan Revision 11 Amendment Proposal (C15)". It is not an official revision.

| Item | Statement |
|---|---|
| What this is | The complete proposal that decision C15 requires (register section 2.3, C15 points 2 to 6): a reconciliation of the Platform Foundation Plan (`docs/platform-foundation-plan.md`, currently at its own **Revision 10**) with every approved decision of the F5 work |
| Name of the revision | **Resolved by AJ:** retain the working title "Foundation Plan Revision 11 Amendment Proposal (C15)". It is not an official Foundation Plan revision. (C15 calls it "Revision 6"; the plan already has a Revision 6 change log and is at Revision 10.) |
| What changes if AJ approves | Nothing automatically. Approval of this proposal does **not** itself authorise any edit to the Foundation Plan or related records. The later documentation task that edits the plan and annotates related records (C15 point 6) needs its **own separate, explicit AJ approval**. That task is not started |
| Existing documents | The Foundation Plan, the W1 plan and the Gate B-1 record are **reference documents only** here. Revision 5, Revision 6, the decision register and the accepted F5.1.0 test list are **unchanged** |
| C16 prerequisite 1 | "Revision 6 Platform Foundation Plan reviewed and explicitly approved." This document is the draft for that review. Drafting it does not satisfy the prerequisite, and approving this proposal does not satisfy it by itself: the exact requirement is a reviewed and explicitly approved Platform Foundation Plan. Whether any approved artifact meets that wording must be verified against C16 before the prerequisite is recorded as satisfied. No status is changed here. **Current status (2026-11-06):** prerequisite 1 is satisfied by AJ's explicit approval of the amended Revision 11 Foundation Plan, not by this proposal |
| No invention | Where an approved decision does not supply wording, this proposal says so and records the item in the unresolved register (section 10). No policy, schema, audit-table or staff-model detail is invented |

## 0. How to read this proposal

### 0.1 Evidence classes (same meaning as the register and the test list)

| Class | Meaning |
|---|---|
| A-H | Approved handover decision, 2026-11-04 (Gate B-1 record, W1 baseline decisions, F5 handover): register sections 2.1, 2.2, 2.5, 2.6 |
| A-R | Approved decision relayed with full wording on 2026-11-05: register section 2.3 |
| A-R+O | Relayed direction or clarification; original wording and approval date unavailable: register section 2.4 and the Business Admin model clarification. **Not treated as fully approved** |
| Deferred | Deferred by AJ (register section 4) |
| Open | Unresolved. No approval exists; no answer is assumed (register section 5; Revision 6 sections 8 and 13) |
| Derived | An inference from approved wording, labelled as such. Not an approval |
| Historical | Existing plan or Revision 5 wording, carried as written. Not current policy where marked superseded |
| Proposed | New wording written for this proposal. It is **not** an approved decision. It is replacement text AJ may approve, amend or reject |

Every proposed rule below carries one of these tags. A rule tagged Proposed is wording, not policy. A rule is "definitive" only where every clause is A-H or A-R. Where a clause is A-R+O, Derived, Open or Deferred, the row says so.

### 0.2 Markers used in the reconciliation tables

| Marker | Meaning |
|---|---|
| SUPERSEDED | The old wording must not be used as the source of truth. It stays in the plan as history (C15 point 5), struck through or labelled, never deleted |
| REPLACED-BY | The proposed replacement wording and its evidence |
| KEPT | Existing wording continues, possibly with an annotation |
| PENDING | Replacement wording cannot be written definitively because a named item is unresolved. The row states what is known and what is not |
| NO CHANGE | Examined and found unaffected |

### 0.3 Numbering traps (carried from register section 0)

R-C1 to R-C4 are the refusal decisions. C2 to C16 are the policy series. W1 C1 to C10 and the plan's CL-1 to CL-8 are different items. The draft's D1 (lock expiry, register) differs from the plan's D1 and D2 (identity provider, sessions). "Rev6" here means the F5 specification, never the plan's Revision 6.

### 0.4 Terminology

X5 (A-R) instructs: "Use the central role terminology **Admin**, not Owner. Owner may remain as an internal product-specific implementation term." This proposal uses **Business Admin** (or Admin) for the single central authority role. Where an approved decision is itself Owner-worded (X2, X3, Y2.1) its wording is quoted unchanged and its application to the Business Admin is shown as **Open (Decision M)**. This proposal does not equate the two.

## 1. What C15 requires and how this proposal conforms

| # | C15 requirement (register section 2.3) | Where met |
|---|---|---|
| 1 | Preserve the existing Platform Foundation Plan as the historical baseline | Section 3 and the NO CHANGE statement in every table: the plan file is not edited; every superseded rule is labelled, not deleted |
| 2 | Prepare a complete Revision 6 amendment proposal covering all approved decisions | Sections 4 to 9 and the checklist in section 12 |
| 3 | Reconcile the single Business Admin model with D3, D13 and D15 | Section 4 |
| 4 | Include all subsequent approved decisions, not just the original seven Revision 5 amendments | Section 2 inventory lists every decision of register sections 2.1 to 2.6 and where it lands |
| 5 | Preserve historical decisions and label superseded rules clearly | Sections 3, 5, 11 |
| 6 | Present the complete proposal to AJ for explicit approval before modifying the plan or related records | Section 13 |
| 7 | No implementation, schema changes, migrations, Git operations or `F3.2.1` | Section 13 |

## 2. Decision inventory: approved, relayed, deferred, unresolved

Each decision of the register is listed once, with where this proposal applies it. "Applied" means a replacement or annotation is proposed. It does not mean the decision is implemented.

### 2.1 Approved with recorded or full wording (A-H and A-R)

| Decision | Class | Content in one line | Applied in |
|---|---|---|---|
| D3 (four-role part) | A-H, then superseded by C5 | Central roles and Account permissions; "fresh authentication for every Owner-only action" | 4.1, 8, 5 (Part 3 section 4) |
| D4 | A-H | Locations product-owned; no central locations table in M1 | 5 (NO CHANGE), 7 |
| D7 | A-H | Ops authoritative for the product registry | NO CHANGE |
| D13 | A-H, amended | Ownership flows O1 to O4; one account per product per identity enforced across creation, claims, transfers, invitations; O4 blocked on E2 | 4.2, 6 |
| D15 | A-H | One membership per user per product, all roles, database-level, no switcher; "managed independently by each product" (AJ consolidation, A-R) | 4.3, 7 |
| Scope S2 / F8.3.2 | A-H | Organisation switcher and multi-business dashboard removed | NO CHANGE (already in Revision 10) |
| X1 | A-H | One membership per product; different businesses across products allowed | 7 |
| X2 | A-H, Owner-worded | Separate ownership-offer flow; a standard employee invitation never independently grants Owner authority | 6.4, 8 (application to Admin: Open, Decision M) |
| X3 | A-H, Owner-worded | Only an existing Owner may initiate a normal O3 transfer; staff must use recovery | 6.3 (application to Admin: Open, Decision M) |
| A2 | A-H | No cooling-off; atomic O3 transfer on acceptance; no 72-hour holding state | 6.3 |
| Y2.1 to Y2.6, Y2-A to Y2-D | A-H | Staff, system-actor, audit, expiry and single-reviewer authority | 6.5, 6.6, 9 |
| W1 C2 to C4, C6 to C10 | A-H | Baseline decisions that touch F5 (register section 2.5) | 9 (annotations only) |
| Standing rules (register 2.6) | A-H | Caterly boundary, no invention, approved documents change only through an AJ-approved documentation task, no Git without approval | 3, 13 |
| Business Admin count rules 1 to 8 | A-R | Exactly one Admin; initial Admin is the registrant; no co-Admins; overall authority; delegated responsibilities do not make an Admin; transfer replaces; recovery appoints one; old arrangements to be reconciled | 4 |
| X5, D1, R-C4 | A-R | Pending-transfer cancel/decline/revoke; lock does not pause expiry; refusal wording reviewed at implementation | 6.3, 6.1 |
| X4 and X4 bootstrap | A-R | Ops Admin authority; one Ops Admin per environment; bootstrap by direct database action at go-live | 6.5, 9 |
| B.2, C8, C9, C10 | A-R | Case opening versus lock; lock not mandatory; lock clearing; offer revocation | 6.5 |
| C11, C12, C13, C14 | A-R | Review-start targets; notice and 30-day checkpoint; revocation when the initiator loses authority; fresh authentication for cancel and decline | 6.3, 6.5 |
| C3, C4, C5, C6 | A-R | Previous Admin after recovery; strict nominee eligibility; single central role; employees managed in products | 4, 6.3, 7, 8 |
| C15, C16 | A-R | This approach; the `F3.2.1` gate | 1, 11 |

### 2.2 Relayed, original wording and date unavailable (A-R+O). Not treated as fully approved

| Decision | Relayed direction | Applied in |
|---|---|---|
| A1 | Freed membership slots usable immediately, no cooling-off | 7 (labelled A-R+O). The plan's cooling-off question stays Open (SLT-10) |
| B1 | Support may open cases; only specifically authorised Ops staff lock, investigate and approve recovery | 6.5 |
| B2 | Previous Admin membership disabled by default; removal only for confirmed compromise or abandonment | 6.5 |
| B3 | Minimum recovery evidence: business document, matching government photo ID, call-back to registered phone, verified access to proposed email | 6.5 |
| B4 | No separate Admin lock notice; keep the 7-day notice to the current Admin | 6.5 |
| B5 | 30-day checkpoint escalated to AJ; no automatic closure or unlocking | 6.5 |
| R-C1, R-C2, R-C3 | Standard refusals, generic claim-link failure, random reference ID; every refusal audited, no secrets logged; other-organisation ids internal only | 6.6 |
| C2 | After a normal transfer the former Admin loses central Admin authority and may stay as an employee or leave | 6.3 |
| Business Admin model clarification | "Treat this as the previously agreed Business Admin model" | 4 |

Revision 5's detailed B1 to B5 conditions are retained as drafted per AJ's instruction (register 2.4). No separate record approves them, so they are **not** treated as approved here.

### 2.3 Deferred (A-H)

A3 (independent out-of-band notification), E-25 / Y2.3 detail (support access policy and durations), O4 (blocked on E2), exact refusal message text (R-C4).

### 2.4 Unresolved (Open)

The full register is section 10. No row of this proposal resolves any of them.

## 3. Preservation rules for the later plan edit

These rules would govern the separate documentation task that applies this proposal if AJ approves it. They are proposed, not applied.

| # | Rule | Basis |
|---|---|---|
| 1 | The plan file keeps every existing sentence. A superseded rule is marked "SUPERSEDED by <decision>, kept as history" in place and is not removed | C15 point 5 |
| 2 | New wording is added beside the old, with its evidence tag, and a new change-log section (the plan's existing pattern: Part 3 section 0 and 0a to 0i) | C15 points 1, 5 |
| 3 | The Revision 10 Gate B-1 text for D3, D13 and D15 is annotated, not rewritten | Register section 2.1; Revision 6 section 11.1 |
| 4 | Nothing resolves Decision M, C7, BC-07, TR-06, TR-21 or any other open question. Rows that depend on them stay PENDING in the plan too | AJ instruction for this task |
| 5 | Relayed decisions (A-R+O) are written as relayed and labelled | AJ instruction for this task |
| 6 | The W1 plan and the Gate B-1 record are annotated by cross-reference only, if at all, and only on AJ's approval | Revision 6 section 11.1 |
| 7 | Roadmap task rows keep their original text; changes appear as an "Amended by Revision 11" line with the new dependency or acceptance text | C15 point 5 |
| 8 | Caterly is untouched. Any Caterly change needs AJ's separate approval | Register section 2.6 |

## 4. The single Business Admin model reconciled with D3, D13 and D15

### 4.1 Model (what is approved)

| Element | Wording | Evidence |
|---|---|---|
| Count | Every business has exactly one Admin. There are no co-Admins or multiple central Admins | A-R (Admin rules 1, 3) |
| Initial Admin | The person who registers the business becomes its initial Admin | A-R (Admin rule 2) |
| Authority | The Admin has overall authority over the business and its product accounts | A-R (Admin rule 4). How this is recognised and exercised inside a product is **Open (BC-07)** |
| Delegation | Managers and employees may receive delegated responsibilities; this does not make them Admins | A-R (Admin rule 5) |
| Replacement | A normal Admin transfer replaces the existing Admin; Ops-led recovery appoints one new Admin | A-R (Admin rules 6, 7) |
| Old arrangements | Previous Owner/co-Owner arrangements must be reconciled against this model | A-R (Admin rule 8). This proposal is that reconciliation |
| Only central role | Business Admin is the only central organisation authority role; no central Manager or Member roles | A-R (C5 pts 1, 2) |
| Central record | Central membership records establish a person's relationship with the business; they grant no product permissions | A-R (C5 pt 4) |
| Employees | Managed entirely in the products; no central membership required; product invitations create no central membership; each product manages membership, roles and permissions independently | A-R (C5 pt 3, C6 pts 1 to 5) |
| Previous Owner/Admin product term | "Caterly may retain its own product-specific Owner terminology" (clarification) | A-R+O |

### 4.2 Reconciliation with D3 (Gate B-1, 2026-11-04)

| D3 element | Proposed treatment | Evidence | Open |
|---|---|---|---|
| "Owner, Admin, Manager, Member kept" | SUPERSEDED by C5. The four-role vocabulary stays in the plan as history | A-R (C5) | The stored role vocabulary for the single central role is a design item (register 5.3) |
| "Fresh authentication for every Owner-only action" | **Not withdrawn and not narrowed to C14 alone.** D2.4 (AJ, 2026-11-05, register section 2.7) establishes the general principle that fresh authentication is required for **sensitive actions**, particularly **starting and cancelling ownership transfers**. C14 confirms start and cancel require it and that **declining** needs only a normal authenticated session | D2.4 (AJ direct decision); A-R (C14 pts 2, 4, 5) | The exact list of other sensitive Admin actions remains **open (ADM-12; test ADM-12, Blocked)**; exact freshness windows are delegated to technical design and unresolved. ADM-12 is not resolved. *Wording corrected 2026-11-06; the earlier draft said "narrowed"* |
| The Account permission matrix (Part 3 section 4) | Rewritten in section 8 | A-R (C5, C6) | Which Owner-only rows (billing, product suspend and unlink, subscription) apply to the Business Admin is **Open (Decision M)**; section 8 shows them as PENDING |
| "No self-promotion; Admin cannot touch Admin or Owner" | Carried as history. Whether it is superseded, narrowed or retained is unresolved | Open (Revision 6 section 13 item 36; test ADM-07) | Yes |

### 4.3 Reconciliation with D13 (ownership flows O1 to O4)

| Flow | Proposed treatment | Evidence |
|---|---|---|
| O1 | The verified creator becomes the initial Admin and holds the product slot in the same transaction; refused if the creator already holds a slot for the product | A-R (Admin rule 2); A-H (D13, W1 C7) |
| O2 | PENDING. The recovery claim is approved (Admin rule 7; Y2.1, Y2.2, Y2-C). Whether consuming an ordinary O2 claim makes the claimant the Admin, who may issue non-recovery claims, and the claim limits are unresolved | Decision M, C7, CLM-02 |
| O3 | Replaced as in 6.3 | A-R |
| O4 | Stays blocked on E2. The plan's "one or several owners, maximum 3, the rest become Admin" is SUPERSEDED by exactly one Admin; the replacement is PENDING | A-H (D13 amended); Revision 6 section 13 item 35 |
| "One account per product per identity enforced across creation, claims, transfers and invitations" | KEPT (D13). Enforcement design is open (4.4) | A-H |

### 4.4 Reconciliation with D15 (one membership per user per product)

| D15 element | Proposed treatment | Evidence | Open |
|---|---|---|---|
| Strict rule: at most one membership per product per identity, in any role; second kitchen needs another email; no switcher | KEPT unchanged | A-H (D15, X1); S2 removed | |
| "managed independently by each product" | Added as an annotation: the per-product management of memberships is the approved description | A-R (AJ 2026-11-05 consolidation) | The mechanics are a design matter |
| "All roles, staff included" | Annotated: "staff" is read as a business's own staff. Whether Platterly staff may hold a membership or slot is **not decided** | Open (STF-11) | Yes |
| Central slot table `membership_product_slots`, `UNIQUE (user_id, product_key)`, slot rows for every member of an organisation linked to a product | **PENDING.** Employees need no central membership (C6), so which people have a central record, and so a slot, is a design item. Enforcement shape in plan section 3b is neither confirmed nor rejected by this proposal | Open (design; Revision 6 R2, section 10; SLT-12); C16 prerequisites 3 and 4 | Yes |
| Disabled member keeps the slot; only removal frees it | Cited for the retained disabled previous Admin (C3) | A-H (W1 C8) | Retained record against the slot rule and invitation refusal: Open (EXC-14, Revision 6 section 13 item 3) |
| Freed slot usable immediately | Annotated with A1 | A-R+O | The plan's own cooling-off question stays Open (SLT-10) |
| Three questions of plan section 3b | Remain Open: cooling-off, wrong-email recovery, invitee refusal message | Open (SLT-10, REC-30, REF-10) | Yes |

## 5. Section-by-section reconciliation

Plan references use the file's own numbering: **Part 1** (technical plan v2.1), **Part 2** (master roadmap), **Part 3** (roadmap Revision 2 and its change logs, including Revision 10). Evidence tags are in the "Evidence" column. "Proposed replacement" is wording for AJ's review.

### 5.1 Part 1

| Ref | Existing wording (short) | Marker | Governing decisions | Proposed replacement or annotation | Evidence | Blocked by |
|---|---|---|---|---|---|---|
| P1 s2 claim definition | `role=owner`, statuses `pending, consumed, expired, revoked, superseded` | PENDING | C5, X5 terminology | What a consumed **ordinary** O2 claim confers (whether the claimant becomes the Business Admin) is PENDING (Decision M, CLM-20). A **recovery** claim, once consumed, appoints the one new Admin [A-R Admin rule 7]. The claim's role-field naming is a design item. Status list KEPT as Historical (Revision 6 section 5.1 uses working labels) | Historical; A-R (Admin rule 7); Proposed | Decision M; design |
| P1 s2 "Normal" | Owner signs in with verified `boundEmail`; one transaction consumes the claim and creates membership | PENDING | Decision M | KEPT as history. Mechanics (secret plus verified email, one transaction) carried; whether the result is the Business Admin is unresolved | Historical | CLM-20, Decision M |
| P1 s2 "Expired" | Claim expires (14 days); staff or the existing owner re-issues | PARTLY REPLACED-BY (lock case only); KEPT as Historical otherwise | D1 pts 1 to 5 (expiry during an ownership lock) | **Corrected 2026-11-06 on AJ's authorisation.** D1 applies to a claim or transfer that expires **during an ownership lock**: it is recorded as expired, its expiry is not paused or extended, and a fresh request is needed if the business still needs to proceed after the lock is lifted. D1 is not applied to every expiry. For expiry at other times the plan's wording (staff or the existing owner re-issues; the re-issue creates a new claim and marks the old one superseded) is KEPT as Historical; whether the fresh-request interpretation extends beyond a lock is **Derived and open** (CLM-02, C7). Who issues the replacement is unresolved. The 14 days stay (Y2-C for recovery claims) | A-R (D1, lock case); A-H (Y2-C); Derived/Open (other expiry) | C7, CLM-02 |
| P1 s2 "Wrong contact email" | Staff revokes and issues a new claim; audited | KEPT | Y2.5, R-C2 | KEPT as history. What follows when staff type a wrong email is Open | Historical | EXC-08 |
| P1 s2 "Changed email" | Old email's pending claim revoked; new one after verification | KEPT | | KEPT as history; subject to F4 | Historical | F4 |
| P1 s2 "Claim uniqueness and competing claims" | One pending per `(businessId, boundEmail)`; at most 3 pending owner claims; 3-Owner cap; atomic limit | SUPERSEDED (Owner cap; recorded capacity of three) / PENDING (rest) | Admin rules 1, 3, 8; C7; register s3 and s5.1 | **(1) Superseded by the single-Admin model:** the three-Owner cap and the Owner-count invariant, including the Owner-count component of the issue and consumption checks ("current Owners plus pending claims would exceed 3") [A-R, Admin rules 1, 3]. **(2) Recorded as superseded in the register (s3, s5.1 and the C7 historical table) and in Revision 6 (s8.1 [Historical], s12 row 2, E-01):** the historical capacity of three pending claims ("at most 3 pending owner claims per business") and the `pending_slot` value range of 1 to 3. The register attributes this to "Exactly one Admin"; Admin rules 1 and 3 concern the number of Admins and do not themselves address pending claims, so this proposal records the supersession as the sources record it and draws no further inference from it. **(3) Still open (C7 item 1):** whether a replacement pending-claim limit exists, and its value. **(4) Still undecided (design):** the `pending_slot` mechanism and its technical design (statuses, CHECK, partial unique index). **Also open:** one pending claim per `(businessId, boundEmail)` (C7 item 4); same-email supersession (C7 item 5); ordering against a pending transfer (C7 item 2); recipient eligibility (C7 item 3). All **five C7 matters stay Open**. The "enforced atomically, never count then insert" principle is KEPT as a design principle | A-R (Admin rules 1, 3); register s3, s5.1 and Revision 6 s8.1 (recorded supersession of the capacity of three); Open (C7) | C7; design |
| P1 s2 "Ownership reissue after consumption" | Not a claim: an owner transfer; old owner becomes Admin unless removed | SUPERSEDED | C2, C4, Admin rule 6 | Replaced by 6.3 | A-R; A-R+O (C2) | |
| P1 s2 "Duplicate safety", "Abuse" | Create idempotent on `businessId`; rate-limited issue/consume | NO CHANGE | | | | |
| P1 s3 role mapping table | Owner, Admin, Manager, Member to Caterly effect | SUPERSEDED / PENDING | C5, C6 | Central Manager and Member roles removed; employees get their product roles inside the product. The Admin's Caterly effect (the current "no Caterly access until a role is assigned") is unresolved | A-R (C5, C6); Open (BC-07) | BC-07, Decision M |
| P1 s3 principle | "Central roles never grant sensitive access" | KEPT | C5 pt 4 | Annotated with C5 pt 4 | A-R | |
| P1 s4 sync | Rows "Owner transfer": two-party, atomic, both products updated by event | KEPT / annotated | A2, C2, C13 | Annotate: transfer is atomic on acceptance (A2); the event carries the Admin change; "owner.changed" naming is a design item | A-H (A2); Open (design) | design |
| P1 s5 | Platform Core canonical, ids adopted | NO CHANGE | | | | |
| P1 s7 customer migration mapping | Old owner becomes pending owner claim or direct owner membership | PENDING | D13, E2 | Blocked with O4 | A-H | E2, C7 |
| P1 s8 | `ownerEmail` as owner model replaced by claims | NO CHANGE | | Annotate "claims" per row P1 s2 | | |
| P1 s9 journey step 3 | "Creator as Owner; existing or migrated business gets its Owners ..." | REPLACED-BY | Admin rules 2, 7 | "Creator as Admin"; migrated businesses PENDING (O4, E2) | A-R | E2 |
| P1 s10 break-glass | Verified owners only, one at a time; forbids transfer and claims while active | PENDING | Decision M | Whose break-glass authority is the Business Admin is unresolved; no ownership action during break-glass is KEPT as history (test EXC-09, design Open) | Historical; Open | Decision M; break-glass design |
| P1 s11 revocation | Removed or disabled in the business: mark the membership removed or disabled and free the slot in one transaction | REPLACED-BY (annotation) | W1 C8 [A-H]; C3 | W1 C8, exact wording (W1 plan section 2): "A disabled member keeps the slot; only removal frees it; unlinking deletes that product's slots and keeps the membership." The plan's "removed or disabled ... free the slot" is annotated accordingly: the slot is freed on **removal**, not on disabling; a disabled member keeps the slot. W1 is not edited. The separate question of the retained disabled previous Admin record against the slot rule and invitation refusal stays Open (EXC-14) | A-H (W1 C8, approved baseline 2026-11-04) | EXC-14 (separate) |
| P1 s12 "Multiple owners" | Cap 3, last-owner invariant, invite as Owner, fresh authentication | SUPERSEDED | Admin rules 1, 3; X2 | Replaced by 6.2 | A-R; A-H (X2) | invariant design |
| P1 s12 "Owner removal" | An owner can step down; removing another goes through the dispute procedure | PENDING | Admin rules 1, 3; C3; B2 | Sole Admin leaving is unresolved (ADM-08, E-07); removal of the previous Admin is limited to B2's exceptions (C3 pt 6) | Open; A-R | ADM-08, E-29 |
| P1 s12 "Ownership dispute or lost access" | Lock, evidence checklist, 7-day notice to all owners, decision by AJ plus second reviewer where possible, new claim | SUPERSEDED in part | B.2, C8 to C12, Y2-A, X4 | Replaced by 6.5 for the ownership-recovery steps. The plan's "decision by AJ plus a recorded second reviewer where possible" is superseded **only for an ownership recovery action** (Y2.2, Y2-A, X4 pt 6: one authorised reviewer suffices). It is **not** superseded for dispute decisions: general dispute dual-control and who decides a contested dispute stay Open (REC-28; Revision 6 section 13 item 23). Remaining also: objection remainder (REC-23), dispute notification | A-R; A-H; Open | REC-28, REC-23, NOT-11 |
| P1 s12 "Event delivery", "Dead letters" | Outbox retry and parking | NO CHANGE | | | | |
| P1 s12 "Email change" | 72-hour hold on ownership transfers, claim consumption and billing contact | KEPT as Historical | | Whose hold applies is not stated; subject to the C15 and F4 reconciliation | Historical | F4; TR-24 |

### 5.2 Part 2 (master roadmap) where it carries ownership wording

| Ref | Existing wording | Marker | Proposed annotation | Evidence |
|---|---|---|---|---|
| P2 E, D3 row | "Approved 2026-11-04: Owner/Admin/Manager/Member; fresh authentication for Owner-only actions" | SUPERSEDED (in part: four roles only) | Annotate with C5, C14 and D2.4 | A-R; D2.4 |
| P2 A, F3.2.2 | "last-owner invariant" | SUPERSEDED | See section 9 | A-R |
| P2 A, F3.2.3 | "Central roles Owner/Admin/Manager/Member" | SUPERSEDED | See section 9 | A-R |
| P2 A, F5.1.1, F5.3.1 | Max 3 pending owner claims; 3-Owner cap | 3-Owner cap and Owner-count check SUPERSEDED; capacity of three pending claims recorded as superseded (register, Revision 6 s8.1); any replacement limit PENDING (C7 item 1) | See section 9 | A-R (Owner cap); register s3, s5.1 (recorded capacity); Open (C7 item 1) |
| P2 A, F4.1.2 | "Hold on ownership actions" | KEPT | Annotate with the email-change hold (Historical) | Historical |
| P2 A, F6.2.1 | Event `owner.changed` | PENDING | Event naming is a design item (Revision 6 section 13 item 16) | Open |
| P2 A, F8.2.2 | "owner membership via sync" | PENDING | Product-side term; Caterly may retain Owner terminology | A-R+O |
| P2 A, F8.4.1 | Break-glass | PENDING | As P1 s10 | Open |
| P2 B | "claims replace email-matched ownership" | NO CHANGE | | |

### 5.3 Part 3

| Ref | Existing wording (short) | Marker | Governing decisions | Proposed replacement or annotation | Evidence | Blocked by |
|---|---|---|---|---|---|---|
| P3 s0 to 0i change logs | Revision history, including 0c (CL tests) and 0i (Revision 10) | KEPT | | A new change-log section for Revision 11 is added; old logs untouched | | |
| P3 s0c tests CL-1 to CL-8 | "Exactly 3 succeed, 5 return 'limit reached'"; `pending_slot` 1 to 3 | HISTORICAL, not carried as expectations / PENDING | Admin rules 1, 3; C7 | Expectations that count Owners (for example CL-2 "Owners plus pending is 3", and CL-7 and CL-8, which the register calls capacity-based) are superseded so far as they count Owners. Expectations that rest on the capacity of three pending claims or the `pending_slot` value range of 1 to 3 (for example CL-1 and CL-5) are recorded as superseded in the register's C7 historical table ("capacity-based expectations are superseded") and in Revision 6 s5.3. Whether a replacement pending-claim limit exists, and its value, is **still open** (C7 item 1); the `pending_slot` mechanism and its design are **still undecided**. As the accepted test list does (CLM-16), none is carried as an expectation; all are redesigned after C7 is decided. Traceability kept | A-R (Owner cap); register C7 historical table and Revision 6 s5.3 (recorded); Open (C7); accepted test list CLM-16 | C7; design |
| P3 s2 Gate B-1 row | D3, D4, D7, D13, D5; Revision 10 status | KEPT + annotated | | Annotate D3 (C5, C14), D13 (Admin model, C4), D15 (A-R consolidation). D5 stays open; O4 stays blocked on E2 | A-H; A-R | D5, E2 |
| P3 s3 O1 | Creator becomes `Owner` | REPLACED-BY | Admin rule 2 | See 6.1 | A-R | BC-07 (product effects) |
| P3 s3 O2 | Staff or Ops issues claim; 3 pending; cap | PENDING | | See 6.2 | Open | Decision M, C7 |
| P3 s3 O3 | Owner names target; owner stays, steps down, or is removed; cap 3; "invitation as Owner" | SUPERSEDED | X2, C2, C4, Admin rule 6 | See 6.3 | A-R; A-H; A-R+O | TR-06, TR-21 |
| P3 s3 O4 | Up to 3 owners; AJ chooses; rest become Admin | PENDING | D13, E2 | See 6.2 | A-H | E2, C7 |
| P3 s3a I1, I2, tests I-01 to I-07 | Team invitations by Owner or Admin as Admin, Manager or Member; migration staff invitations | SUPERSEDED / PENDING | C5, C6, X2 | See section 8 | A-R | EMP-05, EMP-06, E2 |
| P3 s3b D15 | Rule, enforcement table, flow table, three questions | KEPT + annotated | D15, C4, C6 | See 4.4 and section 7. Flow table rows: O3 "target holds no slot (or already a member of this same business)" SUPERSEDED by C4; I1/I2 rows PENDING | A-H; A-R | SLT-12, SLT-10, REC-30, REF-10 |
| P3 s4 permission matrix | Four-role matrix; Owner-only rows; fresh authentication | SUPERSEDED / PENDING | C5, C6, C14, D2.4 | See section 8 | A-R | Decision M, ADM-12 |
| P3 s6 task rows | See section 9 | | | | | |
| P3 s10 IC4 | "at least one verified Owner (up to the cap of 3)" | SUPERSEDED | Admin rules 1, 3 | "exactly one Admin" once a business has been claimed or created; the no-Admin state before the first claim is Open (ADM-09) | A-R; Open | ADM-09 |
| P3 s11 M1 acceptance | Names claims, invitations, ownership, members | KEPT | | Annotate: scope follows section 9 | | |
| P3 s12 M-01 | Every legitimate owner (up to 3) claimed via O4 | PENDING | | O4 blocked; replacement wording unresolved | | E2, C7 |
| P3 s13 Caterly `Member` uniqueness | | NO CHANGE | W1 C9 | Caterly integration is separate | A-H | |
| P3 s14 risk register | "Owner cannot be established without email", "Break-glass" | KEPT + added | | Add the three retained risks (section 11) | | |

## 6. Proposed ownership rules (creation, claims, transfers, recovery, revocation)

Each rule is proposed replacement wording for the plan. The Evidence column states what supports each clause. A clause tagged Proposed or Derived is not an approval. "Open" names the unresolved item that prevents a definitive rule.

### 6.1 O1: new business

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | A signed-in user with a verified email and no membership for the product creates a business in Account | Historical (Plan O1); verified-user requirement is plan wording | |
| 2 | In one transaction Platform Core mints the `biz_` id, creates the organisation, makes the creator its initial Admin, gives the creator the slot for the product and links the business to the product | A-R (Admin rule 2); A-H (W1 C7: "no organisation without a link") | |
| 3 | Refused, with nothing partly written, if the creator already holds a slot for the product | A-H (D13, D15); all-or-nothing: Derived | How slot enforcement fits per-product management (SLT-12, design) |
| 4 | A repeated submit returns the same business (idempotency key per user and key) | Historical (Plan O1) | |
| 5 | Refusal wording follows the approved refusal principles; exact customer-facing text is reviewed and approved during implementation | A-R (R-C4) | |
| 6 | Product-level effects of becoming Admin are not specified here | A-R (Admin rule 4) | BC-07 |

### 6.2 Single-Admin invariant and claims

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | A business has exactly one Admin. No route (employee invitation, role edit, claim while an Admin exists, O1) may produce two central Admins | A-R (Admin rules 1, 3). Route-by-route refusal outcomes for invitations and role edits are Open (ADM-04, ADM-05) | Decision M |
| 2 | The single-Admin invariant, how a disabled sole Admin counts and the atomic replacement are technical designs to be approved before `F3.2.1` | Register 5.3; C16 prerequisite 2 | Design |
| 3 | The state of a business before its first claim (provisioned or imported, awaiting a claim) is not decided | | ADM-09 |
| 4 | How the sole Admin may leave the business is not decided | | ADM-08 (E-07) |
| 5 | Staff may issue a new ownership **recovery** claim after completing the verification process. Staff never directly assign or transfer ownership | A-H (Y2.1) | |
| 6 | One authorised staff member is sufficient to investigate, approve a recovery action and issue the recovery claim. No second reviewer is mandatory | A-H (Y2.2, Y2-A); A-R (X4 pt 6). Scope: an ownership recovery action | Single-person risk E-14 documented (section 11). These decisions do not address dispute decisions (REC-28) |
| 7 | A recovery claim is expired by the system after its 14-day validity. This is a predefined system action, not an ownership decision. No renewal process is invented | A-H (Y2-C) | Whether the same system expiry applies to other claims: CLM-08 |
| 8 | Consuming a recovery claim appoints the one new Admin. The previous Admin stays Admin until consumption (Derived) | A-R (Admin rule 7); Derived (CLM-22) | Y2.1's sentence "The new Owner must complete the secure claim process" is Owner-worded: Decision M (REC-15) |
| 9 | A pending claim expires normally during an ownership lock; its expiry is not paused or extended; it is recorded as expired; a fresh request is needed to proceed | A-R (D1 pts 1 to 5) | How a replacement claim is issued depends on C7 |
| 10 | The slot rule applies on claim consumption: refused, with nothing partly written, if the claimant already holds a slot for the product | A-H (D13) | Design (SLT-12) |
| 11 | **Ordinary O2 claims** (first Admin of an Ops-provisioned or imported business) and **O4 claims** for migrated customers: replacement wording is **PENDING**. Known: claim secret plus a verified matching email (Historical, Plan O2); the plan's 14-day period (Historical). Unknown: whether consumption makes the claimant the Admin (CLM-20), who may issue non-recovery claims (CLM-02), system expiry (CLM-08), notice to the current Admin (NOT-10), locks (CLM-19) | Historical; Open | Decision M, C7, E2 |
| 12 | The **five C7 matters** remain unresolved and are not given wording: (1) pending-claim limit; (2) ordering against a pending transfer; (3) recipient eligibility; (4) whether one pending claim per `(businessId, boundEmail)` survives; (5) whether same-email supersession survives. The sources record the capacity of three pending claims as superseded (register s3, s5.1 and the C7 historical table; Revision 6 s8.1 "not restored" [Historical], s12 row 2, E-01) and the three-Owner cap as superseded by the single-Admin model. They record no replacement. Whether a replacement pending-claim limit exists, and its value, is C7 item 1 and is **not decided or implied here**; the `pending_slot` mechanism and its design are still undecided | Open (C7) | C7 |

### 6.3 O3: normal Admin transfer

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | A normal Admin transfer is started by the initiator through a separate ownership-offer flow; a standard employee invitation never independently grants authority over the business | A-H (X2, Owner-worded); mechanics A-R (C14 pt 5: starting requires fresh authentication) | **Which role is the authorised initiator is PENDING.** X3 ("Only an existing Owner may initiate") is Owner-worded; X5 and C14 refer to "the initiating Business Admin" for cancellation. Whether the Owner of X3 and the Business Admin coincide is Decision M (ADM-06) |
| 2 | Starting a transfer requires fresh authentication | A-R (C14 pt 5); D2.4 | The freshness window is delegated to technical design and unresolved. (At drafting, enforcement was gated by plan D1 and D2; both were approved on 2026-11-05) |
| 3 | The nominee must be entirely new to Platterly and hold no Platterly account. Any existing account makes the person ineligible, including employees and Managers of the same business and the previous Admin | A-R (C4 pts 1 to 4) | What counts as an account; how a nominee who must be new reaches verified acceptance (**TR-06**); refusal versus no-enumeration (REF-07) |
| 4 | Authority passes only at acceptance. Acceptance replaces the Admin in one transaction; no holding period, delayed activation or cancel window exists | A-H (A2); A-R (Admin rule 6) | |
| 5 | The offer expires after 7 days, including during a lock, and is recorded as expired by the system | A-H (Y2.4); A-R (D1 pt 4); A-H (Y2.6) | |
| 6 | After a transfer the former Admin loses central Admin authority and may remain as an employee or leave. If they remain, the new Admin assigns their employee role and permissions through the product workflow. A freed slot is usable immediately | A-R+O (C2, A1) | **When the stay-or-leave choice is made (TR-21)** |
| 7 | The initiator of the pending transfer (X5 and C14 call them "the initiating Business Admin"; the initiating-role mapping is row 1) can cancel it before acceptance, with fresh authentication. The nominee can decline with a normal authenticated session, without fresh authentication. Employees and other members cannot cancel | A-R (X5 pts 1 to 3; C14 pts 1 to 4) | |
| 8 | A completed transfer cannot be cancelled by the normal pending-transfer process | A-R (X5 pt 6) | Routes after completion: Revision 5 proposal (CAN-08) |
| 9 | If the initiating Admin loses Admin authority through a completed recovery or dispute decision while their offer is pending, the system revokes the offer, notifies the nominee, records it in the audit trail, and the nominee cannot accept it. This is an automatic consequence of the authorised replacement | A-R (C13) | Delivery of the notice waits for D5 |
| 10 | Authorised Ops staff may revoke a suspicious pending offer only through a recovery, dispute or security-investigation case, with an authorised reason and an audit trail | A-R (X5 pts 4, 5; C10) | |
| 11 | An ownership lock blocks starting a transfer and blocks acceptance; it does not pause or extend the offer | Historical (Plan O3); A-R (D1 pt 3) | Whether the lock also blocks claims and billing-contact changes: SEC-08, CLM-19 |
| 12 | One pending transfer per business | Historical (Plan O3) | |
| 13 | The Owner-count component of the plan's check "Owners after the change plus pending claims do not exceed 3" is SUPERSEDED by exactly one Admin. The pending-claims component, and how any claim limit combines with a pending transfer, is PENDING. "Target holds no slot (or already a member of this same business)" is SUPERSEDED by C4 | A-R (Admin rules 1, 3; C4) | C7 items 1, 2 (TR-22); C4 versus the plan's slot check (TR-23) |
| 14 | Email-change hold: retained plan wording that the 72-hour hold blocks starting and acceptance. Not current approved policy | Historical | Whose hold applies; F4 (TR-16, TR-24, CLM-24) |
| 15 | The plan's "target is a user id" and acceptance requiring a verified email are carried; whether a signed-in user other than the named nominee can accept is not decided | Historical (Plan O3) | TR-26 (candidate), TR-06 |

### 6.4 Invitations and the boundary with Admin authority

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | Admin authority never travels by employee invitation. A standard employee invitation must never independently grant authority over the business | A-H (X2, Owner-worded) | Application to the Business Admin: Decision M (ADM-04, ADM-05) |
| 2 | Product employee invitations create no central membership and set no central role | A-R (C6 pt 3) | |
| 3 | Employee invitations, roles and permissions are managed inside each product | A-R (C5 pt 3, C6 pts 1, 4) | |

### 6.5 Recovery cases, locks, notices, revocation

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | Every recovery has a case. Support staff may open a recovery, dispute or security case by default. Opening a case never activates `ownership_locked` and grants no authority to review, lock, investigate or approve | A-R (B.2 pts 1 to 3, C8 pts 1, 2, 6, X4 additional pt 3) | Who else may open a case (OPS-10) |
| 2 | Specifically authorised Ops staff review the case. Only specifically authorised Ops staff may activate `ownership_locked`; this records staff identity, reason, case reference and timestamp and is a separate audited action from case creation | A-R (B.2 pts 3 to 6); A-R+O (B1) | Staff identity and permission mechanism: `F4.2.1` (design) |
| 3 | A recovery lock may be activated at the start of review when there is a valid reason; if there is none, recovery may proceed without a lock | A-R (C8 pts 4, 5) | Whether a dispute or security case may or must lock (SEC-14) |
| 4 | Any specifically authorised Ops reviewer holding the explicit `clear ownership lock` permission may clear a lock, whether or not they set it. The Ops Admin has it by default; others must be granted it. Locks are never cleared automatically, including at 30 days. Clearing records staff identity, reason, case reference and timestamp | A-R (C9) | Closing a case with a lock set (REC-31) |
| 5 | Revoking a suspicious pending offer needs the separate `revoke pending offer` permission (Ops Admin by default), a genuine security concern identifying a specific issue related to the offer, a recorded reason and case reference, and the audit trail. Opening a security case does not itself authorise investigation or revocation. Unsupported suspicion or routine support activity is insufficient. One authorised Ops reviewer suffices for this revocation only (C10 pt 8) | A-R (C10); A-H (Y2-B) | |
| 6 | Internal review-start targets: suspected security compromise within 1 hour, ownership dispute within 1 business day, routine recovery within 2 business days. They are not customer-facing promises. A missed target flags the case for escalation to the Ops Admin, with no new backup authority and no automatic closure or lock | A-R (C11) | Business-day definition (design); what the Ops Admin then does (REC-07) |
| 7 | The existing 7-day notice is sent to the current Business Admin after Ops completes initial business and evidence verification, whether or not a lock is active. No separate lock notification is sent. The 7-day period starts when the notice is successfully sent | A-R (C12 pts 1 to 4); A-R+O (B4) | Delivery waits for D5; what the period gates (REC-37); alternative route if the Admin email is compromised (NOT-06) |
| 8 | The 30-day checkpoint starts when the case is opened. If an objection changes a **recovery** case into a dispute, the original 30-day clock continues and does not restart. At 30 days the case is escalated to AJ, with no automatic closure or unlocking | A-R (C12 pts 5 to 7); A-R+O (B5) | AJ's authority at escalation (REC-26); whether and when the checkpoint applies to a case opened as a dispute or a security case (REC-27) |
| 9 | Minimum recovery evidence: a business document, matching government photo ID, a call-back to the registered phone and verified access to the proposed email | A-R+O (B3) | Items beyond the minimum, the employee check and the applicant rule are Revision 5 proposals (REC-10, REC-11, REC-13) |
| 10 | After recovery the previous Admin's central membership is disabled by default; the record and historical Admin role are retained for audit; the disabled membership grants no active authority; they are not made an employee automatically and return as an employee only through the current Admin's normal employee invitation. Removal is limited to confirmed compromise or abandonment | A-R (C3 pts 1 to 4, 6); A-R+O (B2) | How the removal exception is invoked (E-29, REC-35); the retained record against the slot rule (EXC-14) |
| 11 | The recovery appointment of one new Admin takes effect when the recovery claim is consumed (Derived), and the previous Admin is disabled at that moment (Derived) | Derived (CLM-22, REC-17) | Decision M for Y2.1's wording |
| 12 | Disputes: the continuation rule applies only to a recovery case converted into a dispute by an objection (the original 30-day clock continues and does not restart). C12 does not state a 30-day rule for every dispute, and none is stated here. Checkpoint timing for a case opened as a dispute or a security case is unresolved (REC-27). The outcome path and who decides a contested dispute are not decided | A-R (C12 pt 6); Open | REC-27, REC-28, REC-29, NOT-11 |

### 6.6 Staff, system actors, audit and refusals

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | Authorised staff may have limited access to relevant business information for support or recovery; this does not make them members or employees and grants no Owner-level authority. Every staff view is recorded (staff identity, business, date and time, case, reason). No access-management policy or duration is invented | A-H (Y2.3, Y2-D); Deferred (E-25) | "Owner-level authority" against Business Admin (STF-08); what counts as one view (E-32) |
| 2 | System actors execute only predefined, approved actions (offer and invitation expiry, audit recording, enforcing approved restrictions, routine account processes). They never approve a claim, resolve a dispute, assign ownership or clear a lock | A-H (Y2.4, Y2-C); A-R (C9 pt 6) | |
| 3 | Y2.5 [A-H]: "For every relevant staff, customer or system action, record all seven details (draft section 0E.2)." Y2.6 [A-H]: "When a person initiates or authorises an action that is executed automatically, record both separately. Do not attribute the decision to the system merely because the system executed it." Records already specified by approved decisions: a lock carries staff identity, reason, case reference and timestamp (B.2 pt 5); clearing and revocation carry the same with the audit trail (C9 pt 7, C10 pt 6); every staff view records staff identity, business, date and time, case and reason (Y2-D) | A-H (Y2.5, Y2.6, Y2-D); A-R (B.2, C9, C10) | The enumeration of the seven details (actor category; exact actor or system-process identity; action performed; affected business; date and time; reason or associated case; approval details where applicable) comes from Revision 5 section 0E.2, not from the Y2.5 sentence. It is **Historical/Proposed, not an approved list**. Audit table design: C16 prerequisite 4 |
| 4 | Every refused action creates an audit record; secrets, tokens, passwords, OTPs and hashes are never logged; other-organisation ids may be recorded internally with restricted, audited staff access | A-R+O (R-C2, R-C3) | |
| 5 | Standard refusal messages, a generic claim-link failure message, a random support reference id and restricted investigation information. Exact customer-facing text is reviewed during implementation | A-R+O (R-C1); A-R (R-C4) | Invitee refusal message (REF-10) |
| 6 | The Ops Admin has all Ops permissions by default and grants and revokes permissions; other Ops staff hold only assigned permissions; exactly one Ops Admin exists per environment; the Ops Admin may approve a case they opened; permission changes and sensitive actions are audited; "one specifically authorised Ops reviewer is sufficient; no second reviewer is required" (X4 pt 6; recorded for ownership recovery review and approval, see Revision 6 section 13 item 23; its application to dispute decisions is not decided). The production Ops Admin is created by AJ directly in the production database at go-live, not by invitation, registration or appointment | A-R (X4, X4 bootstrap) | Ops Admin succession; staff identity link and permission storage (`F4.2.1`); audit of the bootstrap action |

## 7. Central membership, product-managed employees and product-slot rules

| # | Proposed wording | Evidence | Open |
|---|---|---|---|
| 1 | Business Admin is the only central organisation authority role. There are no central Manager or Member roles | A-R (C5 pts 1, 2) | |
| 2 | A central membership record establishes a person's relationship with the business and grants no product permissions. Employees need no central membership and their product access is separate from any central record | A-R (C5 pt 4, C6 pts 2, 5) | The Admin's own product access: BC-07 |
| 3 | A person with a central record who is not the Admin (for example the disabled previous Admin) has no product permissions from that record | A-R (C5 pt 4) | |
| 4 | Each product manages employee membership, roles and permissions independently | A-R (C6 pt 4); AJ consolidation of D15 | |
| 5 | An identity has at most one membership per product, in any role, enforced at the database; it may belong to different businesses across products; there is no switcher | A-H (D15, X1, S2) | Enforcement design (SLT-12) |
| 6 | One account per product per identity is enforced across creation, claims, transfers and invitations | A-H (D13) | Per-product enforcement design; Caterly side not global until `F8` (W1 C9) |
| 7 | A disabled member keeps the slot; removal frees it; unlinking deletes that product's slots and keeps the membership; a freed slot is usable immediately | A-H (W1 C8); A-R+O (A1) | Cooling-off question for the plan (SLT-10); EXC-14 (retained disabled previous Admin record against the slot rule, separate) |
| 8 | Linking a product to a business checks every existing member and is refused as a whole if any holds a slot for that product elsewhere | A-H (W1 C7) | How "every existing member" applies when employees need no central membership (register 2.5; design) |
| 9 | Platform Core stores no Branch, Kitchen or Store | A-H (D4) | |
| 10 | The case-insensitive email uniqueness (`lower(email)`) is carried | Historical (Plan 3b); a design detail | |
| 11 | Caterly's login, invitations, roles, Admin label, permissions and customer-facing behaviour stay unchanged; Platterly adapts | A-H (standing rule, register 2.6) | |

## 8. Invitation and permission-model changes

### 8.1 Invitations

| Type | Existing (Part 3 s3a) | Proposed | Evidence | Open |
|---|---|---|---|---|
| I1 Standard invitation | Account or Team-page invitations by Owner or Admin, carrying Admin, Manager or Member, 48 hours | Central employee invitations are SUPERSEDED. Each product manages its own employee invitations. A product invitation creates no central membership. The central Business Admin handover is never by invitation | A-R (C5, C6); A-H (X2) | Disposition of the plan's invitation rules for `F5.1.0` and the 48-hour rule (EMP-05, EMP-06) |
| I2 Migration staff invitation | Staff of the 3 migrated customers only; default Member; 14 days | PENDING. The central "Member" default is superseded; the O4 staff mapping depends on E2 | A-R (C5); A-H (O4 blocked) | E2; EMP-07 |
| Invitation uniqueness | One pending per (organisation, `lower(email)`); supersede competing invitations for the same product on accept; refuse at send and at accept for an identity with a slot | PENDING. Held for the disposition decision. D13 still requires the slot check across invitations | A-H (D13); Open | EMP-03, EMP-04, EMP-05 |
| Tests I-01 to I-07 | | PENDING | | EMP-05 |

### 8.2 Permission model (Part 3 section 4, F3.2.3)

C5 leaves one central role. The old matrix has four role columns. The table shows each action row. "PENDING" means the replacement cannot be written without an unresolved decision.

| Action (old row) | Old (Owner / Admin / Manager / Member) | Proposed treatment | Evidence | Open |
|---|---|---|---|---|
| Create a business | Any verified user becomes Owner | Any verified user becomes the Admin of the business they create; cap 1 per product | A-R (Admin rule 2); A-H (D15) | |
| View business, members, products | All four | Central view by the Business Admin. Whether any non-Admin sees central screens is not decided, because no non-Admin central role exists | A-R (C5) | Design |
| Edit business details | Owner, Admin | The Business Admin | Derived (Admin rule 4: overall authority) | |
| Invite members | Owner, Admin | SUPERSEDED: no central employee invitations | A-R (C5, C6) | |
| Remove members | Owner: any non-Owner; Admin: Manager and Member | SUPERSEDED for employees (product-managed). Removal of the previous Admin's central record only under B2's exceptions | A-R (C3 pt 6) | E-29 |
| Assign central roles | Owner, Admin | SUPERSEDED: one central role. No promotion through role edit is stated here | A-R (C5) | ADM-05 |
| Activate a product (link) | Owner, Admin | The Business Admin | Derived (Admin rule 4) | Paid activation billing right (M2) |
| Suspend or unlink a product | Owner only | PENDING | | Decision M |
| Purchase a subscription (M2); cancel, upgrade, downgrade; change billing and GST details | Owner only | PENDING | | Decision M |
| View invoices and payment history | Owner, Admin | PENDING | | Decision M |
| Initiate ownership transfer (O3) | Owner, fresh authentication | PENDING: which role may initiate (X3 is Owner-worded). Mechanics preserved: starting requires fresh authentication | A-R (C14 pt 5) for fresh authentication; A-H (X3) | Decision M (ADM-06) |
| Cancel a pending transfer | Not in the matrix (Revision 5 0B item 6) | New row: the initiator of the pending transfer ("the initiating Business Admin" in X5 and C14), with fresh authentication. The initiating-role mapping follows the row above | A-R (X5, C14) | Decision M (initiating-role mapping) |
| Decline a pending transfer | Not in the matrix | New row: the nominee, with a normal authenticated session | A-R (C14 pts 3, 4) | |
| Manage own profile and security | Everyone | NO CHANGE | | |
| Delete a business | Not available in Account; staff only, manual | KEPT | Historical (as carried by Revision 5 R12) | |
| Fresh authentication on other Admin actions | "Every Owner-only action" | **Not withdrawn and not narrowed to start and cancel.** D2.4 general principle applies (sensitive actions); the list of other sensitive Admin actions is not decided here | D2.4 (AJ direct decision); A-R (C14) | ADM-12 (open); freshness windows delegated |
| "No self-promotion; Admin cannot touch Admin or Owner" | | Carried as history | | ADM-07 |

The typed permission map named in `F3.2.3` (`org.edit`, `member.invite`, `member.remove`, `member.role.assign`, `product.activate`, `product.unlink`, `billing.view`, `billing.manage`, `ownership.transfer`) cannot be finalised until the PENDING rows are decided. This proposal does not define it.

## 9. Affected roadmap tasks, dependencies and acceptance criteria

### 9.1 Task rows

Task text is from Part 2 (master roadmap) and the Part 3 section 6 rows that replace or amend it. "Amended by Revision 11" lines would be added beside the original text. No task is added, removed or reordered by this proposal, and no new task is invented. Where a design item needs a task, that is an AJ decision (question O-F421 below).

| Task | Current scope (short) | Proposed amendment | Dependency change | Acceptance change | Evidence | Blocked by |
|---|---|---|---|---|---|---|
| **F3.2.1** Org schema | `organisations`, `organisation_members` (central role, status, `membership_version`); Revision 10 adds `membership_product_slots`, `UNIQUE (user_id, product_key)`, `lower(email)` index | One central authority role; members table content follows C5/C6 (employees need no central record); single-Admin invariant schema; slot table shape PENDING; audit and outbox tables per W1 C4 | Entry conditions: all five C16 prerequisites (A-R). Not authorised | Add: single-Admin invariant enforced at the database (design to be approved first). Slot test KEPT, scope PENDING | A-R (C5, C6, C16); A-H (D15, W1 C2) | C16 1 to 5; SLT-12; MEM-05 |
| **F3.2.2** Org services | Idempotent create; add/remove/change role; last-owner invariant; version bump; `lockOrganisation`; slots in the same transaction; O1 creator becomes Owner | O1 creator becomes **Admin**; "last-owner invariant" wording SUPERSEDED by the single-Admin invariant and atomic replacement (how the sole Admin may leave stays Open, ADM-08); `lockOrganisation` convention KEPT; slot handling KEPT, design PENDING | Unchanged (F3.2.1) | "Last owner cannot leave" SUPERSEDED. New wording PENDING design | A-R (Admin rules 1, 2, 6); A-H (W1 C3, C7) | Single-Admin invariant design; ADM-08; ADM-10 |
| **F3.2.3** Permission map | Typed map of the section 4 actions; four roles; "Admin cannot touch Admin or Owner" | One central role; map follows 8.2; PENDING rows block the final map | Unchanged | Full role × action matrix SUPERSEDED (one central role); new matrix PENDING | A-R (C5, C14); Open | Decision M; ADM-07; ADM-12 |
| **F4.1.2** Login, reset, recovery, email change | Hold on ownership actions | KEPT; annotate the hold as Historical | none | none | Historical | whose hold applies |
| **F4.2.1** Provider and client registry | Ops staff login stays separate | Annotate: Revision 6 sections 7 and 10 attach the staff identity link, permission storage and staff fresh authentication to this task; no approved source defines that model | none | none | Open (design) | O-F421 |
| **F5.1.0** Ownership flow spec | Spec, state diagrams, test list; "test list reviewed; AJ accepts" | Annotate: AJ accepted two F5.1.0 deliverables on 2026-11-05: the specification (Revision 6, with its section 5.1 working state models, accepted as a decision-reconciled specification) and the 263-row test list. These acceptances record those deliverables only. They are **not** a confirmation that the whole F5.1.0 roadmap task is complete: overall completion is **unconfirmed** until the task row's acceptance conditions have been verified against the Plan row. No further acceptance condition is added here. Open items carried forward | none | Deliverables accepted; overall F5.1.0 completion unconfirmed | Direct AJ acceptance of the specification and the 263-row test list, 2026-11-05 (not an A-R relayed decision) | Verification of the Plan row's acceptance conditions for overall completion |
| **F5.1.1** Claims (O2) | Lifecycle; one pending per `(businessId, boundEmail)`; max 3 pending; 3-Owner cap; `organisation_claims` incl. `pending_slot`; consume by verified email | The three-Owner cap and the Owner-count checks SUPERSEDED by exactly one Admin. The historical capacity of three pending claims and the `pending_slot` 1 to 3 range are recorded as superseded (register, Revision 6 s8.1). Whether a replacement pending-claim limit exists and its value (C7 item 1), and per-email uniqueness (C7 item 4), stay PENDING; the `pending_slot` mechanism and its design stay undecided. Recovery claim per 6.2; ordinary O2 PENDING | Add: C7 decision; staff permission mechanism for issuing | CL-1 to CL-8 not carried as expectations and redesigned after C7 (as CLM-16); new tests from the accepted test list (CLM rows) | A-R; Open (C7) | C7; Decision M; CLM-02 |
| **F5.1.2** Recovery operations | Re-issue, revoke, fix wrong email, notifications; staff-only, audited | Scope aligned to 6.5: case workflow, review, lock, notice, recovery-claim issue, 30-day checkpoint, offer revocation. Wrong-email fix: EXC-08 Open | Add: `F4.2.1` staff identity and permission mechanism; D5 for notices | Add the REC, SEC, STF and OPS test rows of the accepted list | A-R (B.2, C8 to C12, X4) | `F4.2.1`; D5; REC-07, REC-26 |
| **F5.2.1** Invitations | Create, resend, accept, revoke; 48 h; refused at send and accept for identity with a slot; central | Central employee invitations SUPERSEDED. Product-managed per C6. Disposition PENDING | Dependency on this task removed or replaced: PENDING | PENDING | A-R (C5, C6); Open | EMP-05, EMP-06 |
| **F5.2.2** Product-role hint | Suggested product role, non-binding | PENDING with F5.2.1 | PENDING | PENDING | Open | EMP-05 |
| **F5.3.1** Transfer (O3) | Two-party; cap 3; last-owner invariant; fresh auth; `lockOrganisation`; CL-7, CL-8; target holds no slot | Replaced by 6.3. The Owner cap and the Owner-count check are SUPERSEDED. CL-7 and CL-8 are not carried; they are redesigned after C7 (the pending-claim component of the combined limit is Open). Fresh authentication KEPT for start and cancel | Add: TR-06 decision | Tests from the accepted list (TR, CAN, EXC rows); CL-7 and CL-8 redesigned after C7 | A-R (X5, C4, C13, C14); A-R+O (C2) | TR-06; TR-21; TR-22 |
| **F5.3.2** Dispute tooling | `ownership_locked`, evidence record, 7-day notices; "Dual-control where possible" | Y2-A, Y2.2 and X4 pt 6 remove dual-control for an ownership recovery action only, and C10 for revoking a pending offer only. For disputes "Dual-control where possible" is **not** superseded: PENDING (REC-28). Scope per 6.5 | Add: `F4.2.1`; D5 | Add the lock, clearing, revocation and notice test rows | A-H (Y2-A); A-R (C8 to C12) | REC-28; REC-23; SEC-14 |
| **F5.3.3** Email-change interplay | 72 h hold; revoke old-email claims and invitations | KEPT (Historical) | none | none | Historical | F4; whose hold applies |
| **F6.2.1** Event publication | `membership.changed`, `organisation.status`, `owner.changed` | Event naming PENDING (design) | none | none | Open | design |
| **F7.2.1** My Business | Create refused if the user has a membership for the product | NO CHANGE; "Owner" read as Admin | none | none | A-R (Admin rule 2) | |
| **F7.2.2** Members, invitations, role change, owner add/transfer UI | Account team screens | Rewritten for the one-Admin, product-managed-employee model (Revision 6 section 11.1); "owner add" removed; transfer UI follows 6.3. Final screen list PENDING | Replaces F5.2.1 dependency: PENDING | PENDING | A-R (C5, C6) | EMP-05 |
| **F8.2.2** Caterly link receiver | "owner membership via sync" | Product-side term; Caterly may retain Owner terminology | none | none | A-R+O | BC-07 |
| **F8.3.1** Membership consumer | New members get `staff`; sensitive keys never from central | Annotate: central Manager/Member roles do not exist (C5); product roles are product-managed | none | PENDING | A-R (C5, C6) | BC-07 |
| **F8.3.3** Team page | Uses central invitations when flag on; "owner only via claim or transfer" | Central invitations SUPERSEDED (C5, C6); "owner only via claim or transfer" KEPT as history | PENDING | PENDING | A-R; A-H (X2) | EMP-05 |
| **F8.4.1** Break-glass | Owner email code, restricted session | PENDING | none | none | Open | Decision M; break-glass design |
| **F9.1.1** Ops `Business` projection | `ownerEmail` becomes billing contact via `owner.changed` | Annotate event naming (design) | none | none | Open | design |
| **F9.1.2** Provision and claim path | Ends with at least one verified Owner, up to three via O2 | The Owner cap ("up to three legitimate Owners") is SUPERSEDED by exactly one Admin. What O2 provisioning ends with (whether the consumed claim yields the Admin), any claim limit and the no-Admin state before the first claim are PENDING | none | "Gap closed" KEPT; "up to three" SUPERSEDED by the one-Admin rule; the O2 end state PENDING | A-R (Admin rules 1, 3); Open | Decision M; C7; ADM-09 |
| **F10.1.1** Mapping and loader (O4) | One O2 claim per confirmed owner, max 3 | The "max 3 owners" count is SUPERSEDED by exactly one Admin; per-owner O2 claims and any claim limit are PENDING (Revision 6 section 13 item 35) | none | PENDING | A-H (O4 blocked) | E2; C7 |
| **F10.1.5 / M-01** Migration acceptance | Every legitimate owner (up to 3) claimed via O4 | PENDING | none | PENDING | Open | E2; C7 |
| F3.3.2, F6.1.1, F8.3.2, F8.2.3, F8.2.4 | Outbox; registry; switcher (removed); Caterly `Member` uniqueness; `withMemberLock` | NO CHANGE | | | | |

### 9.2 Reference documents (annotation only, only on AJ's approval)

| Document | Sections | Proposed annotation |
|---|---|---|
| W1 plan | 2, 4, 6, 8B, 8C (each read for this correction) | **Section 2:** C2 to C10 are approved baseline decisions and stay A-H (C8 is applied at P1 s11). **Section 4:** F3.2.1 lists a `role` CHECK (owner, admin, manager, member) and `owner_established`; F3.2.3 says "Admin cannot touch Admin or Owner". These differ from C5 (one central role) and are annotated as design items (stored role vocabulary; ADM-07). Nothing more is asserted superseded. **Section 6** (invitations: actual scope) states that W1 has no invitation table and tests slot enforcement on membership creation: no ownership-model content to supersede; the plan's invitation rules stay with EMP-05. **Section 8B** (owner invariants) was read: it specifies a cap of three non-removed owners, a floor of one active owner, `owner_established`, a deferred constraint trigger with an organisation row lock, tests that assume several owners (five concurrent add-owner calls give exactly 3 owners; transfer at the cap), and a recovery sequence "add the new owner first, then remove the old one". The decision register (section 3) records the cap of three, the floor-and-cap form and the multi-owner tests as superseded by exactly one Admin, and 8B is annotated as superseded **on that basis, for those parts only**. The floor, establishment, locking, deadlock and concurrency-test principles are **not** asserted superseded: whether any carries into the single-Admin invariant design is C16 prerequisite 2 and is open. **Section 8C** (outbox sequence) was read: it concerns outbox sequence allocation, ordering, retries and dead letters, and has no ownership-model content ("claiming" there means a worker claiming a row). **No supersession or annotation is proposed for 8C.** Revision 6 section 11.1 lists 8C without a stated reason, so that listing is **unverified** and is not carried |
| Gate B-1 record | D3, D13, D15 | Annotate with C5, C14, C4, the Admin model and the AJ D15 consolidation. Scope S2 and the boundaries unchanged |

### 9.3 `F3.2.1` gate (C16): the five prerequisites and current status

| # | Prerequisite | Current status | What this proposal does |
|---|---|---|---|
| 1 | Revision 6 Platform Foundation Plan reviewed and explicitly approved | **Outstanding at drafting; satisfied 2026-11-06** by AJ's approval of the amended Revision 11 plan. This document was the draft for that review | Nothing. Approval of this proposal does not by itself satisfy it; the exact requirement is verified first |
| 2 | Single-Business-Admin database invariant technically designed and approved | **Outstanding** | Records the open design (6.2 rows 2 to 4) |
| 3 | Organisation membership and product-slot rules finalised | **Outstanding.** C7 and the design items remain | Section 7 and the unresolved register |
| 4 | Relevant schema and audit-table decisions approved | **Outstanding.** Audit table, case record, role vocabulary and lock start time | Records the open items |
| 5 | Separate implementation and migration approvals granted | **None given** | Nothing |

C16 says unrelated open policy questions do not automatically block `F3.2.1`. **`F3.2.1` is not authorised by this proposal.** Existing gates are unchanged: W1 baseline C10 (no database creation, data copy or migration without separate approval), the permanent release process, and the migration guard.

## 10. Unresolved and deferred decisions register

Nothing in this register is resolved by this proposal. Item IDs refer to the accepted F5.1.0 test list (`docs/f5.1.0-test-list-draft.md`), the decision register and Revision 6 section 13. "Blocks" names the proposal rows that stay PENDING.

### 10.1 Policy decisions for AJ

| ID | Item | Blocks |
|---|---|---|
| Decision M | Whether the central Owner of earlier documents, Y2.3's "Owner-level authority" and the Business Admin coincide. The register's section 3 row calling it "moot" is Claude's characterisation, not an AJ decision (Revision 6 section 13 item 33) | 6.2 row 1, 11; 6.3 row 1; 6.4; 8.2; F3.2.3; F8.4.1 |
| C7 (five matters) | Pending-claim limit; ordering against a pending transfer; recipient eligibility; whether one pending claim per `(businessId, boundEmail)` survives; whether same-email supersession survives | 6.2 rows 11, 12; F5.1.1; F9.1.2; F10.1.1; TR-22; EXC-04 |
| BC-07 | How central Admin authority (Admin rule 4) is recognised and exercised within a product, including at transfer and recovery | 4.1; 6.1 row 6; 7 row 2; P1 s3; F8.2.2; F8.3.1 |
| TR-06 | How a nominee who must be new to Platterly (C4) reaches verified acceptance | 6.3 row 3; F5.3.1 |
| TR-21 | When the former Admin's stay-or-leave choice is made | 6.3 row 6 |
| TR-23 | How C4 relates to the plan's slot check at start and acceptance | 6.3 row 13 |
| TR-26 | Whether a signed-in user other than the named nominee can accept (candidate question) | 6.3 row 15 |
| REF-07 | C4's account-exists refusal against R-C1's no-enumeration principle | 6.3 row 3 |
| Claims outside recovery | CLM-02 who may issue; CLM-08 system expiry; NOT-10 claim-issue notice; EXC-08 wrong email typed by staff; ADM-09 the no-Admin state | 6.2 rows 3, 11 |
| Lock interactions | CLM-19 and SEC-08 (claims and other actions while locked); SEC-14 (disputes and security cases); SEC-15 (deletion while locked); REC-31 (closing with a lock set); EXC-13 (pending items during an unlocked recovery) | 6.5 rows 3, 4 |
| Escalation | REC-07 (Ops Admin after a missed target); REC-26 (AJ's authority at 30 days); REC-27 (checkpoint for dispute-first and security-first cases); AUD-09 (audit of these events); REC-37 (what the 7-day period gates) | 6.5 rows 6, 7, 8 |
| Disputes | REC-28 (who decides a contested dispute, and whether dispute decisions need dual-control); REC-29 (outcome "removal of the Admin"); NOT-11 (notification) | 6.5 row 12 |
| Ops and staff | OPS-09 (Ops Admin succession); OPS-10 (who else may open a case); STF-11 (staff holding a slot); STF-12 (issuing a recovery claim an Ops-only permission); STF-13 (Ops as an actor) | 6.5, 6.6 |
| Audit and access | STF-10 and AUD-11 (E-32: what counts as one view, retention); AUD-10 (E-26: unauthenticated actors); SEC-25 (E-27: meaning of "lock access"); REC-35 (E-29: removal exception) | 6.5 row 10; 6.6 |
| Notification | NOT-06 (alternative route for a compromised Admin email; independent notice A3 is Deferred) | 6.5 row 7 |
| D15 questions | SLT-10 (cooling-off); REC-30 (wrong-email lock-out recovery); REF-10 (invitee refusal message) | 4.4; P3 s3b |
| Invitation rules | EMP-05 (disposition of the plan's rules); EMP-06 (other product invitation rules) | 8.1; F5.2.1; F7.2.2; F8.3.3 |
| Admin lifecycle | ADM-07 (self-promotion control); ADM-08 (sole Admin leaving); ADM-12 (which other Admin actions are sensitive for fresh authentication; D2.4 general principle applies) | 4.2; 6.2; 8.2 |
| Retained risk | SEC-26 (E-04): mitigation for a compromised Admin session handing over the business | section 11 |

### 10.2 Revision 5 proposals and provenance questions

AUD-12 (audit row per state change, extension of the existing W1 rule); REC-23 (objection effects remainder); REC-33 (suspected compromise routing); REC-10, REC-11, REC-13, REC-32, EXC-05 (evidence items, employee check, applicant rule, unreachable Admin, former employee: provenance unclear); CAN-08 (routes after completion); SEC-24 (nominee notice after staff revocation); NOT-09 (offer notices and reminders); EXC-07 (email change during a pending offer); EXC-12 (no server error); REF-08 (refusal timing and text). Question for AJ that cuts across them: does the Reg 2.4 instruction to retain Revision 5's B1-B5 conditions "as drafted" amount to approval? The sources do not show that it does (test list 18.12). None of these is treated as approved here.

### 10.3 Design items (no policy decision requested)

Single-Admin invariant and the atomic replacement (C16 prerequisite 2); the stored role vocabulary; the role of the slot table under per-product D15 (SLT-12); retained disabled Admin record against the slot rule (EXC-14); central membership status representation (MEM-05); case record and audit table (C16 prerequisite 4); the staff identity link, permission storage and staff fresh authentication (`F4.2.1`, OPS-11); audit of the production Ops Admin bootstrap (OPS-08); business-day definition (NOT-13); the account-exists check and creation of the nominee's account through the offer; refusal-code catalogue (REF-11); disabled sole Admin (ADM-10); the response to cancelling an expired offer (CAN-09).

### 10.4 External prerequisites and open gates

D5 (auth email sender and templates); plan D1 and D2 (identity provider, session lifetimes); E1 (Logto dev tenant); E2 (old-system read access, blocks O4); `F4` (account recovery and the email-change hold); `F8` (Caterly integration, separately approved); break-glass design; W1 C10 (test database not created); C15 plan approval (this proposal).

### 10.5 Deferred (A-H)

A3 (independent out-of-band notification); E-25 / Y2.3 detail (support access policy and durations); O4 (blocked on E2); exact customer-facing refusal wording (R-C4); CLM-16 (redesign of the historical capacity tests after C7).

### 10.6 Evidence gaps

A1, B1 to B5, R-C1 to R-C3, C2 and the Business Admin model clarification rest on relayed summaries with no recoverable original wording or date (A-R+O). C7 has no approval at all.

### 10.7 Questions raised by this proposal (for AJ)

| ID | Question |
|---|---|
| O-NAME | **Resolved** by AJ: retain the working title "Foundation Plan Revision 11 Amendment Proposal (C15)". It is not an official revision |
| O-W1C8 | **Resolved** on AJ's direction using the approved W1 C8 wording (quoted at P1 s11 in 5.1; source verified in W1 plan section 2). The plan's section 11 wording is annotated to match W1 C8. EXC-14 stays Open. W1 is not edited |
| O-F421 | Should the staff identity link, permission storage and staff fresh authentication be recorded under `F4.2.1`, a new task or both? This proposal only annotates the existing row |
| O-D3ROWS | Which of D3's Owner-only matrix rows (suspend/unlink product, billing and subscription) apply to the Business Admin? This is Decision M and is not answered here |

## 11. Risks and historical wording preserved

### 11.1 Risks carried (register 5.2; not decisions)

| ID | Risk |
|---|---|
| E-04 | A compromised sole Admin can hand over the business once the nominee accepts. It now applies to every business, and notices go to the same inbox. There is no hold (A2) and the out-of-band notice is deferred (A3) |
| E-14 | One authorised reviewer can approve a recovery alone (Y2-A, X4). Mitigations that remain: the audit record (Y2.5, Y2.6) and the recorded staff view (Y2-D) |
| E-23 | A consequence of X5 point 3: employees and other members cannot stop an offer except by asking staff to open a dispute |

### 11.2 Wording that must stay in the plan as history (quoted examples)

The following wording stays in the plan unchanged and is labelled SUPERSEDED. It is listed so the later edit task does not delete it.

| Plan wording | Location | Superseded by |
|---|---|---|
| "at most 3 pending owner claims per business"; "Issue is refused if current Owners plus pending claims would exceed 3. The 3-Owner cap is re-checked under lock at consumption" | Part 1 s2 | The Owner cap and Owner-count check: exactly one Admin [A-R]. The capacity of three pending claims: recorded as superseded in the register and Revision 6 s8.1. Any replacement pending-claim limit, and its value: not decided (C7 item 1) |
| "Not a claim: an owner transfer ... Old owner becomes Admin unless removed" | Part 1 s2 | C2, C4, Admin rule 6 |
| "Multiple owners: Allowed (cap 3). Invariant: a business always has at least one owner; the last owner can neither leave nor be removed" | Part 1 s12 | Exactly one Admin |
| "decision by AJ plus a recorded second reviewer where possible" | Part 1 s12 | Superseded for an ownership recovery action only (Y2.2, Y2-A, X4 pt 6). Not superseded for disputes (REC-28 Open) |
| "7-day notice to all current owner emails" | Part 1 s12 | B4, C12 pts 1, 2 |
| "initiator chooses to stay Owner, step down to Admin, or be removed" | Part 3 s3 O3 | C2 |
| "Target must hold no slot for the product (or already be a member of this same business)" | Part 3 s3 O3 and s3b | C4 |
| "Owner, Admin, Manager and Member kept; every Owner-only row needs fresh authentication" | Part 3 s4 heading | C5, C14 |
| "No self-promotion; Admin cannot touch Admin or Owner" | Part 3 s4 | Unresolved (ADM-07): kept as history |
| "Dual-control where possible" | Part 2 F5.3.2 | Superseded for an ownership recovery action only (Y2-A, X4 pt 6) and for revoking a pending offer (C10). Not superseded for disputes (REC-28 Open) |
| CL-1 "Exactly 3 succeed, 5 return 'limit reached'" and `pending_slot BETWEEN 1 AND 3` | Part 3 s0c | Not carried as expectations; redesign after C7 (CLM-16). Not decided: C7 item 1 and the concurrency design |

Revision 6 section 11.1a lists ten Revision 5 "0B" wording items (invitation as Owner; transfer started by owner or staff; re-ownership not a claim; old owner becomes Admin; matrix with no cancel or decline row; staff and offers; existing owner re-issues; second reviewer where possible). Each is addressed above by the decision named there, or stays pending.

## 12. Final reconciliation checklist

Status key: **Definitive** = every clause of the replacement wording is A-H or A-R. **Provisional** = wording includes an A-R+O, Derived or Proposed clause. **PENDING** = a named unresolved item prevents definitive wording. **No change** = examined, unaffected.

### 12.1 Foundation Plan sections

| Plan section | Replacement status | Evidence | Unresolved item preventing a definitive replacement |
|---|---|---|---|
| Part 1 s2 claim definition and statuses | PENDING | Historical; A-R | Decision M |
| Part 1 s2 "Normal" | PENDING | Historical | Decision M, CLM-20 |
| Part 1 s2 "Expired" | Provisional (corrected 2026-11-06: D1 limited to expiry during a lock) | A-R (D1, lock case); A-H (Y2-C); Derived/Open (other expiry) | C7, CLM-02 |
| Part 1 s2 wrong contact email, changed email | Provisional (history kept) | Historical | EXC-08; F4 |
| Part 1 s2 uniqueness and competing claims | PENDING | A-R (Admin rules); Open | C7 (five matters) |
| Part 1 s2 ownership reissue | Provisional | A-R; A-R+O (C2) | TR-21 |
| Part 1 s2 duplicate safety, abuse | No change | | |
| Part 1 s3 role mapping | PENDING | A-R (C5, C6) | BC-07, Decision M |
| Part 1 s4 sync (owner transfer row) | Provisional | A-H (A2) | event naming (design) |
| Part 1 s5 | No change | | |
| Part 1 s7 migration mapping | PENDING | A-H | E2, C7 |
| Part 1 s8 | No change (cross-reference) | | |
| Part 1 s9 journey step 3 | Provisional | A-R | E2 for migrated businesses |
| Part 1 s10 break-glass | PENDING | Open | Decision M; break-glass design |
| Part 1 s11 revocation | Definitive (annotation) | A-H (W1 C8) | EXC-14 (separate question, stays Open) |
| Part 1 s12 multiple owners, owner removal | PENDING | A-R | invariant design; ADM-08; E-29 |
| Part 1 s12 dispute / lost access | Provisional (recovery steps); PENDING (disputes) | A-R; A-R+O (B3, B4, B5, B2, B1) | REC-28 (including dispute dual-control), REC-23, NOT-11 |
| Part 1 s12 email change | Provisional (history kept) | Historical | F4; TR-24 |
| Part 1 s12 event delivery, dead letters | No change | | |
| Part 2 E (D3 row), A rows in 5.2 | Provisional (annotations) | A-R | |
| Part 3 s0 to 0i change logs | No change (new section added) | | |
| Part 3 s0c CL-1 to CL-8 | PENDING. Owner-count expectations: superseded by the single-Admin model. Historical capacity of three pending claims and `pending_slot` 1 to 3: recorded as superseded in the register and Revision 6. Whether a replacement pending-claim limit exists, and its value: still open (C7 item 1). `pending_slot` mechanism and technical design: still undecided. All five C7 matters remain open | A-R (Owner cap); register s3, s5.1 and C7 history table, Revision 6 s8.1 and s5.3 (recorded capacity supersession); Open (C7) | C7 items 1 to 5; design |
| Part 3 s2 decision gates | Provisional (annotations) | A-H; A-R | D5, E2 |
| Part 3 s3 O1 | Provisional | A-R; A-H | BC-07 (product effects) |
| Part 3 s3 O2 | PENDING | Historical; Open | Decision M, C7, CLM-02 |
| Part 3 s3 O3 | Provisional (initiating role PENDING) | A-R; A-R+O (C2); A-H (A2) | Initiating role (Decision M, ADM-06); TR-06, TR-21, TR-22, TR-23 |
| Part 3 s3 O4 | PENDING | A-H | E2, C7 |
| Part 3 s3a invitations I1, I2, I-01 to I-07 | PENDING | A-R (C5, C6) | EMP-05, EMP-06, E2 |
| Part 3 s3b D15 | Provisional | A-H; A-R; A-R+O (A1) | SLT-12, SLT-10, REC-30, REF-10 |
| Part 3 s4 permission model | PENDING | A-R (C5, C6, C14) | Decision M, ADM-07, ADM-12 |
| Part 3 s6 task rows | see 12.2 | | |
| Part 3 s10 IC4, s11 M1, s12 M-01 | Provisional / PENDING (M-01) | A-R | ADM-09; E2, C7 |
| Part 3 s13 | No change | A-H (W1 C9) | |
| Part 3 s14 risk register | Provisional (add three risks) | Register 5.2 | |
| W1 plan s2, 4, 6, 8B (annotation); s8C (no change) | Provisional for 8B cap and multi-owner tests only; s6: no change; s8C: no change, no annotation or supersession proposed (outbox sequencing, no ownership-model content) | A-H; register s3; W1 text read | 8B floor and invariant principles stay open (C16 prerequisite 2); the 8C listing in Revision 6 s11.1 is unverified and not carried |
| Gate B-1 record D3, D13, D15 (annotation) | Provisional | A-H; A-R | |

### 12.2 Roadmap tasks

| Task | Status | Evidence | Unresolved item |
|---|---|---|---|
| F3.2.1 | PENDING (and unauthorised) | A-R (C16) | C16 1 to 5; SLT-12; MEM-05 |
| F3.2.2 | Provisional / PENDING (invariant) | A-R; A-H | Single-Admin invariant design |
| F3.2.3 | PENDING | A-R (C5) | Decision M; ADM-07; ADM-12 |
| F4.1.2 | Provisional | Historical | F4 |
| F4.2.1 | PENDING | Open (design) | O-F421 |
| F5.1.0 | Specification and 263-row test list: accepted deliverables (annotation). Overall F5.1.0 completion: unconfirmed | Direct AJ acceptance of the specification and the test list (2026-11-05) | Verification of the Plan row's acceptance conditions for overall completion |
| F5.1.1 | PENDING | A-R; Open | C7, Decision M, CLM-02 |
| F5.1.2 | Provisional | A-R | `F4.2.1`; D5; REC-07 |
| F5.2.1, F5.2.2 | PENDING | A-R; Open | EMP-05, EMP-06 |
| F5.3.1 | Provisional | A-R; A-R+O | TR-06, TR-21, TR-22 |
| F5.3.2 | Provisional | A-H; A-R | REC-28, REC-23, SEC-14 |
| F5.3.3 | Provisional | Historical | F4 |
| F6.2.1, F9.1.1 | PENDING | Open | event naming (design) |
| F7.2.1 | Definitive (annotation) | A-R | |
| F7.2.2 | PENDING | A-R (C5, C6) | EMP-05 |
| F8.2.2, F8.3.1 | PENDING | A-R+O | BC-07 |
| F8.3.3 | PENDING | A-R | EMP-05 |
| F8.4.1 | PENDING | Open | Decision M; break-glass design |
| F9.1.2 | PENDING | A-R | C7, Decision M |
| F10.1.1, F10.1.5 / M-01 | PENDING | A-H | E2, C7 |

### 12.3 What the checklist shows

- **No row can be written definitively without an approved decision where the table says PENDING.** The proposal states the known parts and stops there.
- **Every proposed rule carries an evidence tag** (sections 4, 6, 7, 8). Rules resting on A-R+O, Derived or Historical clauses are marked Provisional.
- **The principal blockers to definitive wording** are Decision M, C7, BC-07, TR-06, TR-21, EMP-05/EMP-06, the single-Admin invariant design, the slot-table role (SLT-12), `F4.2.1`, E2 and D5.
- **Unrelated open questions do not automatically block `F3.2.1`** (C16), but several above (C7, the invariant design, the slot rules) are direct C16 prerequisite 3 and 2 items.

## 13. Approval requested and what is not authorised

AJ is asked to review this proposal and either approve it, approve it with changes, or reject it. Open questions for AJ are in 10.7: O-F421 and O-D3ROWS stay open. O-NAME and O-W1C8 are recorded there as resolved on AJ's direction.

| Statement | |
|---|---|
| Effect of approval | Approving this proposal does **not** authorise any edit to the Foundation Plan or related records. Applying the wording to the plan and annotating related records (C15 point 6) is a separate documentation task that needs its own explicit AJ approval. C16 prerequisite 1 is **not** marked satisfied by approval of this proposal; whether an approved artifact meets its exact wording must be verified at that time. The other four prerequisites stay outstanding |
| Not authorised by this document | Any edit to the Foundation Plan, W1 plan, Gate B-1 record, Revision 5, Revision 6, the decision register or the F5.1.0 test list; `F3.2.1`; any implementation, schema, migration, database or service work; any status, handover or memory record update; any Git operation |
| Files created or changed | This document only |
| Nothing resolved | Decision M, C7, BC-07, TR-06, TR-21 and every other open question remain open |
