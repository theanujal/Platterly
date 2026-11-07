# Membership and Product-Slot Rules: Design Proposal (C16 prerequisite 3)

**Status (updated 2026-11-06): C16 prerequisite 3 is recorded as APPROVED by AJ on the decisions listed in section 0.1.** **MPS-9 was approved by AJ later on 2026-11-06 and is recorded in section 0.1.** Decisions not listed there (MPS-4, MPS-10, MPS-11, MPS-12) and **MPS-15 remain open and are not approved**. Text below that calls a recommendation "Proposed" describes its state at drafting; section 0.1 governs what is approved. Prepared 2026-11-06. It recommends rules for the open membership and product-slot questions so that AJ can decide them in one pass. Every recommendation not listed in section 0.1 is **Proposed** and is not an approved decision. It does **not** authorise `F3.2.1`, and creates no schema, migration, code, database or service. Prerequisites 4 and 5 stay outstanding. Wording in SQL-like or table form is logical design, not a migration.

| Item | Statement |
|---|---|
| Task text received | The task message reached this session **cut off mid-sentence** at "Show how the recommended" (end of its section 4). Sections 1 to 3 and the start of section 4 were complete. This proposal answers sections 1 to 3 in full and, for section 4, reconciles the whole lifecycle (section 4 below). It applies the same documentation-only boundaries as the earlier tasks. Anything the lost remainder asked for should be sent again |
| Evidence tags | **A-H**, **A-R**, **A-R+O** (relayed, not fully approved), **AJ-P** (AJ's P1 to P6 decisions of 2026-11-06), **Historical**, **Open**, **Derived**, **Proposed** (written here; not an approval) |
| Policy or technical | Each recommendation is marked **[Policy]** (AJ decides) or **[Technical]** (engineering, AJ confirms the design) |

## 0.1 Approval record (AJ, 2026-11-06)

Recorded as AJ approved them. Identifiers were renamed from `D-n` to `MPS-n` (Membership and Product-Slot decision n) in the same pass so that they cannot be confused with the existing approved decisions `D1` to `D15` of the Foundation Plan. **The existing approved D15 (one membership per user per product, managed independently by each product) is unchanged.** Only the identifiers changed; no decision substance changed.

| ID | Approved decision | Section |
|---|---|---|
| **MPS-1** | One pending ordinary claim (class O or A) and one pending recovery claim (class R) per business | 3A, 3A.1 |
| **MPS-2** | First successful commit wins for classes A and R. Class O remains subject to Decision M | 3A |
| **MPS-3** | C4 eligibility is not extended | 3A |
| **MPS-3b** | Reuse the existing slot when an eligible current employee becomes Admin | 3A |
| **MPS-5** | X3: the former Admin's slot follows the product membership. Retained unchanged in phase 1 | 3B |
| **MPS-6** | S1: no cooling-off period | 3C |
| **MPS-7** | The proposed two-phase slot model, including independent slot identity (`slot_id`), D15 uniqueness as a separate membership guarantee (G1), holder consistency (G2) and separate historical events | 3D |
| **MPS-8** | The new Admin receives a slot on appointment | 3D.3 |
| **MPS-9** *(approved later on 2026-11-06)* | Same-email reissue: the previous claim is **superseded**. Different-email reissue: the previous claim is **revoked**. (Recorded exactly as approved. This replaces the draft's "refused until revoked first" for a different email: the reissue itself revokes. Who may revoke, the required reason, case reference and audit remain as approved in MPS-14) | 3A row 5 |
| **MPS-13** | A slot is not a seat or capacity unit | 3D.1 |
| **MPS-14** | Option A: a separate Ops permission for claim revocation. Recipient decline remains a separate action and event | 3A.3 |

**Also recorded.** W1 C8's disabled-member slot rule ("a disabled member keeps the slot; only removal frees it") applies to the **product membership**.

**Not approved, remain open (not silently resolved).**

| Item | State |
|---|---|
| **MPS-15** (recovery-claim replacement) | Remains the **recovery-claim replacement proposal**; **not approved** as a new policy decision by this approval |
| **MPS-4** (C7 item 4, one pending claim per `(businessId, boundEmail)`) | Not listed in AJ's approval. It follows from MPS-1 as a consequence but is **not separately recorded as approved** |
| **MPS-9** (C7 item 5) | **Now approved** (see the approved table above); no longer open |
| **MPS-10** (REC-30 routing), **MPS-11** (inviter-facing refusal information, a change to plan wording), **MPS-12** (REF-07) | Identified as safe to defer; **open** |
| **OT-1 to OT-5** | Open (phase 2 and prerequisite 4 items) |
| Decision M, BC-07, P6, CLM-02, CLM-20, CLM-08, STF-12, TR-06, TR-21, TR-23, REC-28, REC-29, EXC-08, NOT-10 | Open, as before |
| Product-employee slot reuse under MPS-3b | In **phase 1 the ledger holds no employee slot** (employees are product-held, phase 2, OT-1); MPS-3b applies to a slot that exists, and in phase 1 the interim rule of MPS-5 applies. This records a dependency, not a change |

**Effect.** C16 prerequisite 3 is recorded as fully satisfied on the decisions above (all five C7 matters are decided: items 1 to 3 and 5 by MPS-1, MPS-2, MPS-3 and MPS-9, item 4 as the consequence of MPS-1). Prerequisites 4 and 5 stay outstanding and `F3.2.1` stays unauthorised.

## 0. Source check

| Matter | Where the wording was found | Result |
|---|---|---|
| Plan Revision 11, section 3b (D15 rule, enforcement table, flow table, the three questions) | `docs/platform-foundation-plan.md` | Found and read |
| C7 (five matters) | Register section 5.1, C7 historical table; Revision 6 section 8.1; test list CLM-16, EXC-04, TR-22 | **No approval exists.** The register records that no project record states a pending-claim limit, an ordering rule or a recipient-eligibility rule. Items 4 and 5 appear only in the historical table and Revision 6, "not inferred either way" |
| EXC-14 | Test list row EXC-14; Revision 6 section 13 item 3; register W1 C8 row | Found. "Requires: technical design (slot rule and invitation refusal against a retained record)" |
| SLT-10 | Test list SLT-09 and SLT-10; register A1 (section 2.4) and A2 (section 2.1); plan section 3b; Revision 5 `docs/f5-ownership-flow-spec-draft.md` A.1 | Found. A1 is **A-R+O**; Revision 5 A.1 recommended "no cooling-off" and listed alternatives; plan section 3b both states "the freed slot is usable at once" in its enforcement table and lists the question as "not yet decided" |
| SLT-12 | Test list SLT-12; Revision 6 R2 and section 10; register section 5.3 | Found: "Requires: technical design" |
| REC-30 | Test list REC-30; plan section 3b; Revision 6 S4 and 11.4 | Found: "The plan proposes the dispute procedure and Revision 6 routes S4 to the same case [Proposed]" |
| REF-10 | Test list REF-10, REF-07; Revision 6 section 5.7; Revision 5 section 2.C | Found; R-C1 to R-C3 are **A-R+O**, R-C4 is **A-R** |
| Approved Single-Business-Admin design | `docs/single-business-admin-invariant-design-proposal.md` (360 lines) | Read. The task states it as approved and records decisions P1 to P6. **`.claude/STATUS.md` does not yet record that approval** (its "recommended next step" row still reads "not started"). Treated as approved here because the task says so; the status record is stale and is not edited |
| Owner claims versus Admin claims | Plan Part 1 section 2 and O2/O4 (`role=owner`, "creates Owner membership"); register C7 and Decision M; test list CLM-20; Revision 6 R7 and section 13 item 33 | Whether the plan's Owner claim is a central Business Admin claim is **Decision M, open**. Nothing in the record settles it; section 3A.0 does not assume it |
| Plan "Revision 6" confusion | Plan has its own Revision 6 change log; "Rev6" elsewhere is the F5 specification | Not a gap |

Nothing needed was missing, but two things are **not in the repository**: (a) the original wording and date of A1, B1 to B5 and R-C1 to R-C3, which the register records as unavailable; (b) any approval of a pending-claim limit.

## 1. Executive summary

The six items fall into one coherent model once one distinction is held fixed: **central membership is about the relationship to the business and the single Admin; a product slot is about an identity's exclusive place in a product, and follows the product membership.** Central Admin replacement never touches slots (approved invariant design). The recommendations below follow from that.

| Item | Recommendation (Proposed) | Type |
|---|---|---|
| **C7-1** pending-claim limit | **Revised recommendation (Proposed, not approved).** Two independent limits: at most **one pending ordinary ownership claim** (class O or A) and, separately, at most **one pending recovery claim** (class R) per business. An ordinary claim therefore cannot block the approved recovery route; contention for the single Admin seat is settled at consumption by the expected-previous check. The old three-claim limit is not restored. Reassessment in 3A.1, including the recovery-claim replacement rule (MPS-15); it depends on the undecided revocation rule (3A.3, MPS-14) | Policy |
| **C7-2** claim versus pending transfer | No new blocking rule. A claim that appoints the central Admin (class A or R) is settled against a pending transfer by the expected-previous check in `replaceAdmin`: first to commit wins, and a completed recovery revokes the offer (C13). Class O (historical Owner claims) is **not ruled on** until Decision M | Policy |
| **C7-3** recipient eligibility | **C4 is not extended** to claims: the recipient needs a verified match to the bound email and no slot for the product in another business. One sub-question needs AJ (same-business slot) | Policy |
| **C7-4** one pending per `(businessId, boundEmail)` | Replaced by the stronger "one pending per business" | Policy (follows C7-1) |
| **C7-5** same-email supersession | **Approved (MPS-9, 2026-11-06):** same-email reissue supersedes the previous claim; different-email reissue revokes it | Policy |
| **EXC-14** former Admin's slot | The slot **follows the product membership**, not the disabled central record. Central replacement releases nothing. Interim: retain until a product signal exists | Policy |
| **SLT-10** cooling-off | **Recommendation only: no cooling-off.** A slot freed by removal, leaving or unlinking would be reusable at once, with no "released" state. The plan's own wording conflicts (section 3C), so this is not an existing or approved rule | Policy |
| **SLT-12** slot model | A slot instance has its own `slot_id`, is associated with one business, one linked product and one holder membership, and has no state column; `(user_id, product_key)` uniqueness is a **separate** D15 guarantee. No capacity or seat count is established or invented. Built in two phases: central holders now, product-held employees when the Caterly integration is separately approved. Five technical decisions are **left open** (section 3D.6) | Technical, with policy points |
| **REC-30** wrong-email recovery | Existing decisions route this to the recovery case workflow; the **one** decision needed to close the membership/slot question is to confirm that routing. Broader recovery stays with its own gate | Policy |
| **REF-10** refusal | Stable internal reason codes, one generic user message per class. The proposal that the inviter learns nothing about the invitee's memberships **changes the effect of existing plan wording and requires AJ's approval (MPS-11)** | Policy and technical |

## 2. Constraints taken as given (not reopened)

| Constraint | Source | Effect on this proposal |
|---|---|---|
| Normal-transfer nominee must be entirely new to Platterly | A-R, C4 | Not extended to claims or invitations (C7-3) |
| Central membership establishes the relationship and grants no product permission | A-R, C5 | The slot model never reads central role for permissions |
| Employees are managed inside their products and need no central membership; product invitations create none | A-R, C6 | Employee slots are product-held, never central records |
| One membership per user per product, in any role, enforced at the database; no switcher; another kitchen needs another email | A-H, D15, X1 | A separate `UNIQUE (user_id, product_key)` constraint on the ledger (G1); the slot's own identity is `slot_id` |
| "Managed independently by each product" | A-R, AJ consolidation 2026-11-05 | The ledger records exclusivity only; the product decides roles and permissions |
| A disabled member keeps the slot; only removal frees it; unlinking deletes that product's slots and keeps the membership | A-H, W1 C8 | Disabled never frees; removal and unlink do |
| O1 selects and links the product, and the creator takes the slot, in one transaction; linking checks every existing member | A-H, W1 C7, D13 | Preserved |
| One active Admin after establishment, atomic replacement, former Admin `disabled`, central replacement has no automatic product-membership or slot effect | AJ-P (P1 to P4), invariant design I-7 | `replaceAdmin` never touches slots; route services handle slot steps |
| P5 (former Admin's slot) and P6 (reappointment) deferred | AJ-P | P5 is taken up here as EXC-14; **P6 stays deferred** |
| A2: no transfer cooling-off; acceptance atomic; no 72-hour holding state | A-H, A2 | Concerns the **transfer** only; it does not answer SLT-10 |
| Recovery, transfer, dispute and Ops rules (B.2, C8 to C14, X4, X5, Y2-A to Y2-D, D1) | A-R / A-H | Unchanged |

## 3. The six decisions

### 3A. C7: pending ownership claims

**3A.0 Claim classes (Owner claims versus Admin claims).** The record uses "claim" for three different things. This proposal keeps them apart and does **not** assume that the plan's Owner claim is a central Business Admin claim.

| Class | What it is | Evidence | What consumption confers |
|---|---|---|---|
| **O** Owner claim (the plan's O2 and O4 claim) | A staff-issued, email-bound, 14-day secret; the plan's wording is `role=owner` and "creates Owner membership" (Part 1 section 2, O2, O4) | **Historical**, Owner-worded. Whether the plan's Owner and the central Business Admin are the same is **Decision M, open** (CLM-20; Revision 6 R7 and section 13 item 33) | **Not decided.** Not assumed to appoint the central Admin |
| **A** Central Admin claim | A claim whose consumption would appoint the one central Business Admin of a business that has none | **Proposed concept only.** It exists only if AJ decides under Decision M / CLM-20 that an ordinary or migrated claim is of this kind, or creates a new claim kind. No approval states that class A exists | Appoint the Admin through `replaceAdmin` with no expected previous Admin |
| **R** Recovery claim | Issued after the recovery verification; consuming it appoints the one new Admin | **A-R**, Admin rule 7; **A-H**, Y2.1, Y2.2, Y2-C (14-day system expiry). Y2.1's own sentence is Owner-worded (Decision M) | Appoint the Admin through `replaceAdmin` with the current Admin as the expected previous Admin |

**Which rule covers which class.**

| Rule | Classes covered | Why |
|---|---|---|
| C7-1 limit | **Two groups, each limited separately:** ordinary (**O and A**) and recovery (**R**) | The count does not depend on what a claim confers, so it needs no ruling on Decision M. Keeping recovery in its own group preserves the approved recovery route (3A.1) |
| C7-2 ordering against a pending transfer | **A and R only** | They are consumed through `replaceAdmin`, so the expected-previous check settles the order. For class **O** the answer depends on whether it appoints the Admin: **not ruled on until Decision M** |
| C7-3 recipient, C7-4 uniqueness, C7-5 supersession | **O, A and R** | They concern the claim envelope (who may receive it, how many, whether a re-issue replaces it), not the role it confers. Recovery claims keep their own recovery-gate rules (for example the B3 evidence minimum), which are not restated |

If Decision M finds that classes O and A are the same, the classes merge and every rule stands. If it does not, class O's treatment goes to Decision M, and C7-1 only becomes more conservative. Nothing here fixes what a class O claim confers.

**Single seat.** After C5 and the single-Admin model there is one Admin seat per business, so a claim that appoints the Admin competes for that one seat.

| # | Question | Alternatives | Recommended rule [Proposed, Policy] | Consequences | Depends on |
|---|---|---|---|---|---|
| **1** | Maximum pending claims | (a) one combined limit across O, A and R *(the earlier recommendation in this document, withdrawn in this pass, see 3A.1)*; (b) **separate limits for ordinary (O, A) and recovery (R)**; (c) recovery automatically supersedes an ordinary claim; (d) a small fixed N>1 | **(b) Revised recommendation, Proposed and not approved: at most one pending ordinary ownership claim (O or A) per business, and at most one pending recovery claim (R) per business, counted independently.** An ordinary claim never blocks issuing a recovery claim, and a recovery claim never blocks an ordinary one. The earlier "three" is not restored: it counted several owners, which the single-Admin model removed (no evidence of approval of a replacement exists) | Within each group, staff never hold two competing pending claims. A reissue supersedes (same email) or revokes (different email) the pending claim in the same group (item 5, MPS-9; revocation authority MPS-14). A partial unique index per business and group among pending claims would be the database backstop. If Decision M later creates a claim type that may legitimately coexist with another in the same group, this is revisited | A-R (Admin rules 1, 3, 7) for the single seat and the recovery route; Decision M and CLM-20 (what class O confers) stay open; CLM-02, STF-12 (who may issue) stay open; MPS-14 (who may revoke) |
| **2** | Pending claim versus pending ownership transfer | (a) first to commit wins; (b) a pending recovery claim suspends the transfer; (c) a pending transfer blocks claims | **(a) No new blocking rule, for classes A and R.** A claim that appoints the central Admin is consumed through `replaceAdmin` with an expected-previous Admin check. A class **R** claim can coexist with a pending transfer: whichever commits first wins; recovery consumption revokes the offer and notifies the nominee [A-R, C13]; if the transfer is accepted first, the recovery claim's expected-previous Admin no longer matches and it fails. A class **A** claim applies only where there is no Admin, and a transfer needs an initiating Admin, so they cannot coexist. **Class O is not ruled on:** whether an Owner claim can meet a transfer depends on whether it appoints the Admin (Decision M). **Direct dependency from the C7-1 revision:** an ordinary claim and a recovery claim may now be pending together; the same expected-previous check decides which one appoints the Admin (3A.1). Only an ownership lock blocks either (C8: the lock is optional for a recovery) | No new state or timer. Consistent with D1 (a lock does not pause expiry). EXC-13 (an unlocked recovery with an offer still completable) is answered the same way for class R; whether staff should lock first belongs to the recovery gate | C13, C8, D1, invariant design; Decision M for class O |
| **3** | Recipient eligibility | (a) any verified holder of the bound email who holds no slot for the product elsewhere; (b) must be new to Platterly (extend C4); (c) must be an existing account | **(a), for classes O, A and R. C4 is not extended**: it is scoped to the normal transfer [register C7 text]. Eligibility is: verified access to the bound email, plus no slot for the product in a **different** business (D13, plan section 3b). The recipient may already have a Platterly account | (b) would block a migrated customer whose owner already has an account, and a recovery appointee who is an existing employee. Refusal wording follows REF-10; it must not reveal an account's existence (R-C1). **Sub-question for AJ (C7-3b):** may the recipient already hold a slot for the product **in this same business** (for example an employee promoted by recovery)? The plan's slot rule reads without that exception; the answer changes whether the existing slot is reused. Recommended: **yes, reuse**, because refusing would make it impossible to appoint a current employee | D13, D15, C4 (unchanged), R-C1; **P6 stays deferred**: this rule is silent on whether the previous Admin may be the recipient |
| **4** | One pending claim per `(businessId, boundEmail)` | (a) keep as is; (b) replace by item 1; (c) drop | **(b) Replaced by item 1 (one per business within each group).** One pending per group already implies one per `(business, email)` within that group | The `(businessId, boundEmail)` index is redundant | Item 1 |
| **5** | Same-email supersession | (a) survives; (b) survives for any email; (c) never: always revoke first | **(a) Survives for the same bound email only, within a group (classes O, A and R, as claim mechanics).** Issuing a second claim to the **same** email in the **same group** atomically supersedes the first (the old secret stops working), which is the safe "resend" case. **Approved wording (MPS-9):** a reissue to a **different** email **revokes** the previous claim, with the actor, reason, case reference and audit as approved in MPS-14 | The wrong-email correction (EXC-08) is a reissue that revokes. No silent change of recipient. Expiry during a lock is unchanged (D1: not paused or extended; a fresh request after the lock) | EXC-08 stays open for the *procedure*; D1; MPS-14 |

#### 3A.1 Reassessment of C7-1: ordinary claims must not block recovery

**What the earlier recommendation did.** It counted pending claims of classes O, A and R together and allowed one in total per business.

**The conflict.** Recovery is an **approved** route to a new Business Admin [A-R, Admin rule 7; A-H, Y2.1, Y2.2, Y2-A, Y2-C]. Under a combined limit an unrelated pending ordinary claim would occupy the single place and **prevent a recovery claim from being issued** until it expired (14 days) or was revoked, and no approved decision says who may revoke a claim (3A.3). A rule meant to avoid ambiguity would then delay or block an approved route.

| # | Scenario | Combined limit (earlier) | Separate limits (revised) |
|---|---|---|---|
| 1 | Established business; the Admin has lost access; a stale pending ordinary (class O) claim is still within its 14 days. What a class O claim does on an established business is Decision M | Recovery claim **cannot be issued** until the stale claim expires or is revoked | Recovery proceeds; the stale claim is a separate matter |
| 2 | Unclaimed business; a pending ordinary claim was sent to a wrong address | Revoke then issue (needs MPS-14) | Same |
| 3 | A recovery claim was issued to a wrong proposed email mid-case | Revoke then issue (needs MPS-14) | Same, within the recovery group |
| 4 | An ordinary and a recovery claim are both pending | Cannot happen | Can happen; **only one can appoint the Admin**: whichever commits first wins; the other fails the expected-previous check |
| 5 | A dispute design that needs two simultaneous recovery claims | Forbidden | Forbidden within the recovery group (the dispute path is open: REC-28, REC-29) |

**Alternatives.**

| Option | Rule | Assessment |
|---|---|---|
| L1 One combined limit (earlier) | One pending ownership claim of any class | Simple, but can block the approved recovery route (scenario 1). **Withdrawn** |
| **L2 Separate limits** (recommended) | One pending ordinary claim (O or A) **and**, independently, one pending recovery claim (R) per business | Preserves recovery; keeps one candidate per path; adds no system action |
| L3 Recovery supersedes ordinary | Issuing a recovery claim automatically supersedes any pending ordinary claim | The effect on someone else's claim would be an automatic or staff decision about an ownership claim that no approval authorises (Y2.4: system actors never decide claims; C13 is limited to offers). Not recommended without explicit approval |
| L4 Larger N per group | Allow N pending claims per group | Reintroduces competing candidates and the multi-owner thinking the single-Admin model removed. Not recommended |

**Revised recommendation [Proposed, Policy, not approved]: L2.** (i) At most one pending **ordinary** ownership claim (class O or A) per business. (ii) At most one pending **recovery** claim (class R) per business. (iii) The two counts are independent: neither blocks issuing the other. (iv) Contention for the single Admin seat is settled **at consumption** by the expected-previous Admin check, not by the limits.

**How an existing ordinary claim behaves when recovery begins or completes.**

| Moment | Behaviour (Proposed) | Status |
|---|---|---|
| Recovery begins (case opened, or a recovery claim issued) | **No effect** on a pending ordinary claim: it is neither blocked nor revoked. Staff may revoke it under MPS-14 if they judge it a risk | Proposed |
| Recovery completes (recovery claim consumed, new Admin appointed) | A pending ordinary claim **remains pending**: nothing changes its status, and **no new automatic system action is introduced**. Whether its later **consumption** can succeed depends on what it would confer; see the stage table that follows. This proposal does **not** assume that every ordinary claim becomes invalid after recovery | Proposed, conditional on Decision M |
| Automatic revocation of the ordinary claim at that moment | **Open.** C13 revokes a pending *offer* automatically; it is **not extended** to claims. An automatic claim revocation would need AJ's approval | Open |
| What a class O claim could otherwise do on a business that already has an Admin | **Open (Decision M, ADM-01).** The invariant only guarantees it cannot create a second Admin | Open |

**Still open after this revision:** whether an ordinary claim may be *issued* for a business that already has an Admin (not decided; the design is safe either way); Decision M (what class O confers); automatic revocation of an ordinary claim on recovery completion; whether N>1 is ever wanted; who may issue ordinary and recovery claims (CLM-02, STF-12); the dispute design (REC-28, REC-29); migrated-customer claims (O4, blocked on E2).

**An ordinary claim after recovery completes: issuance, pending status and consumption are three different things.**

| Stage | Question | Position in this proposal | Dependence |
|---|---|---|---|
| **Issuance** | May an ordinary claim be **issued** for a business that already has an Admin? | **Not decided.** This proposal neither permits nor forbids it | Open: Decision M, CLM-02, ADM-01 |
| **Pending status** | Does a pending ordinary claim stay pending when recovery completes? | **Yes.** Recovery completion does not change its status (no automatic revocation; C13 is not extended to claims). It ends by expiry, consumption, revocation or the recipient's decline | Proposed |
| **Successful consumption** | Can it succeed after recovery? | **Conditional.** (i) If consumption would **appoint the central Admin** (class A, or class O **only if** Decision M finds the Owner claim to be an Admin claim), it is **refused** once an Admin exists, because the approved invariant allows no second Admin (the expected-previous check fails). That is a consequence of the invariant, not a new policy choice. (ii) If a class O claim would confer **something other than Admin authority**, its outcome is **undecided**; this proposal does not say that it succeeds or fails | Conditional on **Decision M**, which stays open |

**Recovery claim reissue and supersession (a stalled recovery and a new case).**

*Scenario.* (1) A recovery claim is issued and occupies the single recovery place. (2) The recovery stalls (for example the recipient never acts, or the proposed address proves wrong). (3) A legitimate new recovery case begins for the same business. (4) The pending recovery claim still occupies the only R place.

*Fixed points.* Opening a case grants no authority and changes nothing else [A-R, B.2, C8 point 6]. A recovery claim is issued only after the verification process, and one authorised reviewer suffices [A-H, Y2.1, Y2.2, Y2-A]. A recovery claim expires after 14 days by system action [A-H, Y2-C]. The record does not say whether more than one recovery case may be open for one business at once (**open**).

| Option | Rule | Assessment |
|---|---|---|
| **P1 Wait for expiry** | The new case cannot issue a claim until the old one expires (14 days) | Safe for the old claim, but delays a legitimate recovery; no approved reason to make the business wait |
| **P2 Explicit revocation, then issue** | An authorised actor revokes the old claim (MPS-14), then issues the new one | Clear and auditable; two steps with a gap in which neither claim is valid |
| **P3 Automatic supersession by the new case** | Opening, or progressing, the new case automatically invalidates the old claim | **Rejected.** A case change must not alter an issued claim: opening a case grants no authority (B.2), and system actors never decide claims (Y2.4). It would let a mere case entry cancel a claim whose recipient may be acting in good faith |
| **P4 Explicit replacement (revoke and reissue as one audited operation)** (recommended) | At the new case's **issue step** only, an authorised actor performs one operation that revokes the old recovery claim and issues the new one, in one transaction | Same effect as P2 without the gap; the old claim stays fully valid until the replacement actually happens |

**Recommended rule [Proposed, Policy, not approved]: P4.**

1. **Opening or advancing a case never revokes or supersedes an existing recovery claim.** Only the replacement operation does.
2. **Who authorises.** One authorised Ops actor who holds **both** the authority to issue a recovery claim (Y2.1, Y2.2: recovery permissions are explicitly restricted to authorised staff) **and** the claim-revocation permission recommended in MPS-14 (Option A). The actor must be a reviewer authorised on the **new** case, and the replacement happens only when that case has itself completed verification and reached the approved issue step. One authorised reviewer sufficing is consistent with Y2-A; whether Y2-A's scope covers replacing a pending claim is **Derived** and needs AJ's confirmation. The current Business Admin has no role in it.
3. **Same email or different email.** If the new case's proposed address is the same as the old claim's, the new claim supersedes the old one (C7-5). If it differs, the old claim is revoked in the same operation (C7-5's "revoke first"). Either way it is the **same audited replacement operation**, with the same authority, reason and case reference.
4. **Required record.** The actor (and, where a person authorised and a process executed, both: Y2.6); the permission used; the **reason** for replacement (for example stalled, wrong address, new evidence); the **new case reference**; the **case reference under which the old claim was issued**; the identities and classes of the old and new claims; the old claim's previous status and how it ended; and the time. Secrets and tokens are never logged (R-C2). The audit layout is audit-table design, **C16 prerequisite 4**, and is not approved.
5. **Security of the old claim.** Until the replacement commits, the old claim stays valid and unaffected. If its recipient consumes it first, the replacement fails (the single-Admin invariant and the lock settle the race) and the new case must be re-evaluated. A new claim gets its own 14-day period; the old one is not extended.

*Still open:* whether more than one recovery case may be open for a business; whether Y2-A covers replacement; whether the old recipient is notified (NOT-10 and related); the status label for a replaced claim (a design item); whether the Ops Admin alone may perform it (X4 gives the Ops Admin all permissions by default). **AJ decides (MPS-15).**

#### 3A.2 Compatibility check: does the revised C7-1 contradict an approved decision?

| Approved decision | Finding |
|---|---|
| Admin rules 1, 3, 7 (one Admin; recovery appoints one new Admin) | No contradiction. The revised rule **preserves** the recovery route that the combined limit could have blocked |
| Y2.1, Y2.2, Y2-A (staff may issue a recovery claim after verification; one reviewer suffices) | No contradiction. The limit controls how many may be pending, not who may issue |
| Y2-C (recovery claim expires after 14 days by system action) | Supports the limits: expiry frees the place without staff action |
| D1 (claims expire normally during a lock; a fresh request is needed afterwards) | No contradiction: an expired claim is no longer pending |
| C8 to C12 (case, optional lock, notice, checkpoint, dispute conversion) | No contradiction. Nothing there requires two simultaneous pending claims in one group |
| C13 (a completed recovery revokes a pending *transfer offer*) | Concerns offers, not claims; not extended |
| C10 and X5 (revocation of a suspicious pending *offer* or transfer) | Concern offers and transfers, not claims; not extended (3A.3) |
| Plan Part 1 section 2, "Wrong contact email: staff revokes and issues a new claim; audited" | **Historical, kept**; the only record that staff can revoke a claim |

**Result: no approved decision is contradicted by the revised rule.** It still **depends on** three undecided matters, all exposed rather than resolved: (1) **revocation authority (MPS-14, 3A.3)**; (2) the **dispute design** (REC-28, REC-29), because a design needing two simultaneous claims *in the same group* would be forbidden; (3) a **wrong proposed email** mid-case (EXC-08), which needs the revocation in point 1.

#### 3A.3 MPS-14: who may revoke a pending ownership claim [decision for AJ]

**What the existing decisions actually cover (scope as written).**

| Source | Covers | Does **not** cover |
|---|---|---|
| C10 [A-R] | Revoking a suspicious pending **offer**; needs the separate `revoke pending offer` permission (Ops Admin by default, others explicitly granted); a genuine, specific security concern; reason, case reference and audit trail; one authorised Ops reviewer suffices | Claims |
| X5 [A-R] | The **initiating Business Admin** may cancel a pending **transfer**; the nominee may decline; employees cannot; authorised Ops staff may revoke a suspicious pending **transfer** only through a recovery, dispute or security-investigation process, with reason and audit | Claims |
| C13 [A-R] | Automatic revocation of a pending **offer** when its initiator loses Admin authority | Claims |
| Y2.4, Y2.5, Y2.6 [A-H] | System actors never decide claims; every relevant action is recorded in full; initiator and executor are recorded separately | Who may revoke a claim |
| Plan Part 1 section 2 [Historical] | "Staff revokes and issues a new claim ... Audited with reason" (wrong contact email); the "existing owner re-issues" half was corrected as Historical in note R11-1 | An approved permission |
| CLM-02, STF-12 [Open] | Who may issue ordinary and recovery claims | Revocation |

**Conclusion:** no approved decision gives anyone authority to revoke a pending **claim**. C10 and X5 are used here only as evidence of how AJ has structured revocation for **offers**; they are not extended to claims.

**Options.**

| Option | Who may revoke | Consequences |
|---|---|---|
| **A (recommended)** Separate Ops permission, plus recipient decline | Authorised Ops staff holding an explicit, **separate** `revoke pending claim` permission (Ops Admin by default; others must be granted), **by analogy** with C10's structure, not by extending it. The **recipient** may also decline their own claim | Fits the existing Ops authority model and keeps the wrong-email correction available. Needs the permission catalogue (`F4.2.1`, O-F421), not designed here |
| B Issuing authority only | Whoever may issue the claim may revoke it | Simple, but ties revocation to the undecided issuing rules (CLM-02, STF-12) and leaves a claim stuck if the issuer is unavailable |
| C Extend C10's `revoke pending offer` permission | The same permission covers claims | **Not recommended.** C10's test (a specific security concern about a pending offer) does not fit correcting a mistaken address, and extending a recorded permission needs AJ's explicit approval |
| D No revocation; expiry only | Nobody | A wrongly-addressed claim, including a recovery claim, waits up to 14 days; contradicts the Historical plan sentence; stalls recovery |

**Revocation and recipient decline are different events.**

| Aspect | **Revocation** | **Recipient decline** |
|---|---|---|
| What it is | An authorised actor invalidates a pending claim | The intended recipient voluntarily declines **their own** claim |
| Actor | Authorised Ops staff holding the revocation permission (Option A). **Never** the recipient; **never** the current Business Admin for a recovery claim | The recipient only, as the holder of the claim's secret and the verified bound email |
| Authority | An explicit, separate permission (recommended); the permission catalogue is `F4.2.1` / O-F421, not designed here | None beyond being the recipient. It gives **no authority over any other claim**, and does not let the recipient revoke someone else's claim |
| Reason | **Required** | None required of the recipient; whether one is invited is a design item |
| Case reference | **Required** for a recovery claim; open for an ordinary claim | Not applicable; the record carries the claim's own case reference if it has one |
| Audit | Actor, permission, reason, case reference, claim identity and class, previous status, time | **Actor is the recipient**, with the event recorded as a **decline, distinct from a revocation**; claim identity and class, time; no secret |
| Resulting claim state | Revoked (working label) | Declined (working label); whether this is a status or only an event is a design item |
| Effect on other claims or cases | None | None; it frees the group's single place |

**Authority separately by claim class.**

| Class | Revocation authority | Recipient decline |
|---|---|---|
| **O / A** ordinary | Authorised Ops staff with the permission. Class A has no Admin to act. For class O on an established business, whether the Business Admin has any revocation authority is **open (Decision M)** | Allowed (recommended) |
| **R** recovery | Authorised Ops staff with the permission only, tied to a case. **The Business Admin cannot revoke a recovery claim** | Allowed (recommended) |

The audit table, its columns and any implementation remain under **C16 prerequisite 4**; this lists required facts, not a layout.

**Who must not revoke (Option A).** The **current Business Admin** may not revoke a **recovery** claim: recovery exists for the case where the Admin is lost, compromised or contested, and an objection already has its own route (conversion to a dispute, C12). For class A there is no Admin to revoke. The **claimant** may only decline their own claim, never someone else's.

**Per claim type.**

| Class | Recommended treatment |
|---|---|
| **R** recovery claim | Authorised Ops permission only; a **case reference is required** (a recovery claim arises from a case); recorded as a case event; the recipient may **decline** their own claim (a separate event, not a revocation). Replacement by a new case: 3A.1 (MPS-15) |
| **O / A** ordinary claim | Same permission; **reason required**. An ordinary claim has no approved case concept, so whether a case reference is needed is **open** (the audit record carries reason, actor and class) |
| All | System actors never revoke a claim; the only automatic ending is expiry (Y2-C, D1) |

**Required record (Option A).** Under Y2.5 and Y2.6 the audit record shows the actor (and, where a person authorised and a process executed, both), claim identity and class, previous status, the reason, the case reference where one exists, and the time; secrets and tokens are never logged (R-C2). **The audit table design is C16 prerequisite 4 and is not approved**; this lists required facts, not a layout.

**What happens when a claim is revoked while another claim or case is active.**

| Situation | Recommended behaviour [Proposed] | Open |
|---|---|---|
| Ordinary claim revoked while a recovery case is active | Allowed; the case is unaffected (separate groups) | None |
| Recovery claim revoked while its case is active | The case continues (its lifecycle is not decided here); a new recovery claim may be issued only after the revocation (one pending per group) | Case closing (REC-31) |
| Revocation during an objection or dispute | Not decided: the dispute path is open | REC-28, REC-29 |
| Revocation while the business is locked | Recommended **not blocked** by a lock, because it reduces risk; a lock blocks consumption, not revocation | CLM-19, SEC-08 (open) |
| Revocation and the existing Admin | **Never appoints or removes an Admin**; state-neutral | None |
| Notification to the recipient | Not decided | NOT-10 and related (open) |

**Recommendation:** Option A, with the per-class treatment above. **AJ decides.** Nothing here is approved.

**Not part of C7 and left open:** who may issue an ordinary claim (CLM-02), whether consuming an ordinary claim makes the claimant the Admin (CLM-20, Decision M), whether class A exists at all, system expiry of non-recovery claims (CLM-08), the claim-issue notice (NOT-10).

### 3B. EXC-14: the former Admin's product slot

**The question.** After a central replacement, the former Admin's central record is `disabled` (AJ-P, P4). W1 C8 says "a disabled member keeps the slot". Does the retained record keep a slot, and how does that fit C2 (the former Admin "may remain as an employee or leave") and C3 (they may return only as an employee, through the current Admin's invitation)? Central replacement does not itself touch slots (invariant design).

| Option | Rule | Consequences |
|---|---|---|
| **X1** Release at replacement | The slot is freed the moment the Admin is replaced | Frees the person at once (A1-consistent), but contradicts a product employee relationship that the person may keep (C2) and makes central replacement have a slot side effect, which the approved design forbids |
| **X2** Retain on the disabled central record until removal | Literal reading of W1 C8 applied to the central record | Safe, but the person is locked out of other kitchens until staff remove them (B2 removal is only for compromise or abandonment), and it ties a slot to a record that grants nothing (C5). It conflicts with C2's "may leave" |
| **X3** (recommended) The slot follows the **product membership**; the disabled central record is **not** a slot holder in its own right | W1 C8 ("a disabled member keeps the slot; only removal frees it") applies to the **product membership**. After a replacement the route service performs a separate **slot disposition** step: if the former Admin has a product membership in this business and product (stays as an employee, C2), the slot is **re-pointed** to it, never freed; if not (leaves, C2), the slot is freed by removal under SLT-10 | Keeps central and product membership separate. A person who stays keeps access under the product's rules, a person who leaves is free at once. **Needs the product-membership signal (F8, BC-07)** to know which case applies |

**Recommendation (Proposed, Policy): X3 as the target rule, with an interim.** Until the product can report whether the former Admin holds a product membership (separately approved Caterly integration; BC-07 open), the route service **retains** the slot unchanged and flags it for reconciliation. Retaining is exactly W1 C8 as written (A-H), so the interim contradicts nothing approved.

**What AJ must decide:** (1) approve X3 as the target; (2) confirm that W1 C8 is read as applying to the product membership; (3) that interim retention is acceptable. **P6 stays deferred**; EXC-14's *invitation refusal* half is answered only by: a return as an employee reuses the same slot (re-pointing within the same business, no freeing), not a new one.

**Boundary kept:** this is a separate step of the route (transfer acceptance, recovery); it is **not** inside `replaceAdmin`.

### 3C. SLT-10: cooling-off for freed slots

**Distinction.** A2 is about the **ownership transfer** (authority passes at acceptance, no 72-hour holding state). SLT-10 is about a **freed product slot**. A2 does not answer SLT-10 and is not used as evidence here.

**Existing wording, and the conflict in it (all non-final).** The same approved plan section (3b) says two things that do not agree:

| Where | Exact wording | Status |
|---|---|---|
| Plan 3b, table headed "Database enforcement (specification for `F5.1.0` to confirm before `F3.2.1`)" | "When a member leaves, is removed or the link is removed: The slots are deleted in the same transaction; the freed slot is usable at once" | A specification **for F5.1.0 to confirm**, not a final decision on SLT-10 |
| Plan 3b, "Questions for the `F5.1.0` spec (not yet decided)" | "whether a freed slot has any cooling-off period (proposed: none)" | The question is recorded as **not yet decided** |
| Register 2.4, A1 | "Freed membership slots become available immediately, with no cooling-off period" | **A-R+O**: relayed; original wording and date unavailable; not treated as fully approved |
| Revision 5 A.1 | Recommended no cooling-off; alternatives (a) a 24 to 72 hour hold, (b) a hold after staff removal or recovery | **Proposed**, listed as open for AJ |

So "usable at once" appears as a specification, a relay and a recommendation, while the plan also lists the question as undecided. **No source is a full approval of immediate reuse, and this proposal does not alter any plan wording.** Immediate reuse below is a **recommendation only**.

| Option | Lifecycle | Impact |
|---|---|---|
| **S1 Immediate reuse, no residual state** (recommended) | A slot is **freed** by (a) removal, (b) the person leaving, (c) unlinking the product. Freeing deletes the slot row in the same transaction. Disabling never frees. Nothing remains | Simplest to test; no timer or hold row; a removed employee can accept another kitchen's invitation at once; D15 only forbids being in two at once |
| S2 Fixed hold on the freed identity | A held state with an expiry, duration chosen by AJ | Needs a new state, a timer and a release job; blocks quick legitimate re-hire; the Revision 5 analysis found no extra protection for the removed person. The duration would be a policy number this proposal does not invent |
| S3 Hold only after staff removal or recovery | A hold applies to those causes | Same cost as S2; creates two classes of freed slot |

**Recommendation (Proposed, Policy): S1.** Because A1 is only relayed, AJ should approve it explicitly so that SLT-10 closes on a full approval rather than a relay. **Until AJ approves MPS-6, SLT-10 stays open, the plan is unchanged, and no document should treat immediate reuse as decided.** There is **no** "released" or "cooling" state. Onboarding impact: a product invitation or claim is checked against the ledger at send and again at acceptance or consumption; a slot freed a moment earlier is usable immediately.

### 3D. SLT-12: product-slot data model and lifecycle

Policy points are marked **[Policy]**; the rest is **[Technical]** for AJ to confirm. **Where the evidence does not support a final design, the exact decision is listed as open in 3D.6 and no rule is invented.**

**Evidence available.** The W1 plan's `F3.2.1` table for `membership_product_slots` (a planned table, not authorised for build, whose role under per-product management is exactly SLT-12): columns `user_id`, `product_key`, `organisation_id`, `member_id`; `UNIQUE (user_id, product_key)`; foreign key `(organisation_id, product_key)` to `organisation_products` (on delete cascade); foreign key `(member_id, organisation_id)` to `organisation_members` (on delete cascade). Plan section 3b (the enforcement specification for `F5.1.0` to confirm). W1 C2, C7, C8, C9. **Nothing in the record defines a product-held slot or how a product would write one.**

#### 3D.1 Slot identity, membership identity and availability

**What a "slot" is in the sources.** The record (D15, X1, W1 C8, plan 3b) uses "slot" for **one identity's exclusive place in one product**. It is not a seat in a pool: **no source reviewed for this proposal establishes a fixed slot count, a capacity or a seat limit**, and none is invented here. Any plan- or subscription-based limit on the number of people would be a different rule, found nowhere in these sources, and is not designed here (**MPS-13** asks AJ to confirm that a slot is not a capacity unit).

**Three things that must not be confused.**

| Thing | What it is | Identified by | Lives where |
|---|---|---|---|
| **Slot instance** | One allocated place: one identity holding one product, tied to one business | Its own **`slot_id`** (a surrogate identifier, never reused) [Technical, Proposed]. A new `slot_id` is created at each allocation, so history can refer to one specific allocation even after the row is gone | The slot ledger (Platform Core) |
| **Membership** (holder) | The record that justifies the slot: a central member row (phase 1, `organisation_members.id`), or a product's own membership record (phase 2, OT-1) | The membership's own id | `organisation_members`, or the product |
| **Identity-product pair** | The D15 rule's subject: a person and a product | `(user_id, product_key)` | A **separate uniqueness constraint** on the ledger, not the slot's identity (guarantee G1 below) |

An earlier draft used `(user_id, product_key)` as the slot's key. That conflated slot identity with the D15 rule and left history without a stable reference. It is replaced: the slot has its own `slot_id`, and D15 is enforced by an independent constraint.

**How an "available" slot is identified before a user is allocated.** There is no pre-existing slot to identify. A slot instance comes into being only at **allocation**, in the same transaction that creates the holder. "Available" is therefore a property of the **pair**, not of a slot: the identity has no ledger row for that product, and the business is linked to the product (`organisation_products`). The check is: *does a row exist for `(user_id, product_key)`?* If not, allocation may proceed; if so, the request is refused (G1). A freed slot has no row either, so "available again" means the same thing. (Whether it may be reused at once is the separate, open SLT-10 question, MPS-6.)

**How a slot instance is associated** [Technical, from the W1 table]:

| Association | Column | Constraint |
|---|---|---|
| Business | `organisation_id` | The one business in which that identity holds its membership for the product |
| Product | `product_key` | `(organisation_id, product_key)` references an existing `organisation_products` link, so a slot cannot outlive its link |
| Holder membership | Phase 1: `member_id` | `(member_id, organisation_id, user_id)` references the member row (see G2). Phase 2: a product membership reference (open, OT-1) |
| Person | `user_id` | Equal to the holder's person (G2) |

#### 3D.2 Two independent guarantees

| Guarantee | Question it answers | Mechanism [Technical, Proposed] | Layer |
|---|---|---|---|
| **G1: D15** (a membership guarantee, separate from slot identity) | May one identity hold more than one place in a product, across all businesses? | `UNIQUE (user_id, product_key)` on the ledger. At most one slot row per identity per product. The slot's own identity is `slot_id`; this constraint is a rule about people and products, not the slot's key | Database |
| **G2: one holder per slot** | Is every slot tied to exactly one membership, in the slot's own business, belonging to the same person? And does a membership hold at most one slot per product? | Exactly one holder reference is set (a `CHECK`). For a central holder: `UNIQUE (member_id, product_key)`, and a composite foreign key `(member_id, organisation_id, user_id)` to the member row (which then needs a unique `(id, organisation_id, user_id)`), so the slot's person and business equal the holder's. `user_id` is immutable on Admin rows (single-Admin design), so it cannot drift. The slot's own key is `slot_id` | Database for central holders. **For product holders: not decidable here (OT-1, OT-5)** |

**Why they are independent.** G1 alone would let a slot point at the wrong person's or the wrong business's membership. G2 alone would let two memberships of the same identity in different businesses each hold their own slot. Neither implies the other, so both are needed.

#### 3D.3 Lifecycle [Policy where marked]

| Event | Slot effect | Basis |
|---|---|---|
| **Allocation** | In the same transaction that creates the holder; a new slot instance (`slot_id`) comes into being. A unique violation (G1 or G2) fails the whole operation | A-H, plan 3b |
| O1 new business | Creator's slot allocated in the O1 transaction | A-H, W1 C7 |
| Central Admin appointed (class A or R claim, or transfer) | The new Admin's slot is allocated by the **route**, not by `replaceAdmin`, if the Admin holds a slot at all. **Derived** from O1 symmetry; **Policy confirmation needed (MPS-8)** | Derived |
| **Disabled** membership | **No change.** The slot row is untouched; a disabled holder still blocks the identity (G1) | A-H, W1 C8 |
| **Release** by removal or leaving | The slot row is deleted in the same transaction; reusable at once **only if MPS-6 is approved** | A-H (W1 C8); SLT-10 recommendation |
| Former Admin after replacement | Per EXC-14, X3: re-point if a product membership exists, else free; interim: retain | Proposed |
| **Pending claim or transfer** | **Holds no slot and reserves none.** Checked at issue (or start) and **re-checked at consumption (or acceptance)**; G1 decides a race. A pending item never makes a freed slot unavailable | Plan 3b, D13 |
| Unlink a product | Delete that product's slots; keep the membership | A-H, W1 C8 |
| Link a product | Refused as a whole if any **central** member holds a slot for the product elsewhere. Product-held members cannot be checked until phase 2 (OT-1) | A-H, W1 C7 |
| Organisation deleted by staff | Out of scope | n/a |

#### 3D.4 History preservation

**Why current state and history are separate concerns.** The ledger answers one question *now*: who holds a place in which product, so that uniqueness can be enforced. History answers a different question: *what happened, to whom, when and why*. They differ in four ways. (1) **Lifetime:** a slot instance ends at release, but its history must remain. (2) **Constraints:** the ledger's unique keys must see only live rows; a past allocation must never block a future one. (3) **Mutability:** the ledger changes, history is append-only. (4) **Access and retention:** who may read history and for how long are audit questions (E-32, open) that must not shape the ledger. Mixing them (keeping released rows in the ledger with a `released_at`) is the alternative **H2**; it is not recommended for these reasons.

**Events that must be retained** [Technical; the facts are illustrative, not an approved record layout]:

| Event | Trigger | Minimum facts to reconstruct it |
|---|---|---|
| **Allocation** | O1, claim consumption, transfer or recovery appointment, product membership created | `slot_id`, identity, product, business, holder, who or what acted, the cause, time |
| **Release** | Removal, leaving, unlink | `slot_id`, identity, product, business, holder, cause, who acted, time |
| **Reassignment** (holder changes, slot not freed) | A former Admin's slot re-pointed to their product membership (EXC-14, X3); any other holder change | `slot_id`, previous holder, new holder, cause, who acted, time |
| **Membership disabling and enabling** | A member is disabled or re-enabled. **The slot does not change** (W1 C8) | The membership, new status, whether it holds a slot, cause, who acted, time. Recorded as a **membership** event; shown here because it explains why a slot is retained |
| **Other relevant membership changes** | Central Admin replaced (previous Admin disabled, new Admin active), a removal exception (B2), product link or unlink | The membership, before and after status, cause, who acted, time. Several are already audited by the single-Admin design's replacement record |
| **Refusal** | A slot request refused (G1 or G2) | Reason code, actor, business, time (R-C2 requires every refused action to be audited) |

**Dependency on C16 prerequisite 4.** The audit table, its columns, its retention and its access rules are **audit-table design, which is C16 prerequisite 4**. That design is **not approved**, no audit implementation or schema is approved or created, and the table above says only which **events** must be capturable. The W1 plan already plans an append-only `audit_logs` table (updates and deletes blocked by trigger) and an unlink audit row that records member ids and slot count before the slots are deleted; this is evidence of intent, not an approved design for slot events. **What each event record must contain is open (OT-3).**

| Option | Description | Verdict |
|---|---|---|
| **H1 Separate history events** (recommended) | The ledger holds only live rows. Each event above is written to the append-only audit log in the **same transaction** as the ledger change, so a change and its record commit or fail together. `slot_id` links the events of one allocation | Keeps the ledger's keys simple and history immutable; depends on prerequisite 4 |
| H2 Keep released rows in the ledger | Add `released_at`; unique keys become partial over unreleased rows | In-table history, but mixes the two concerns and risks a released row being mistaken for a holding state. Not recommended |

#### 3D.5 Interaction with product-managed employee memberships

1. C6: employees are managed in their products and need no central record, so **phase 1 ledger rows exist only for central holders** (the Admin and, under interim retention, a former Admin). No employee has a ledger row in phase 1.
2. D15 for employees is therefore enforced by each product for its own employees until the Caterly integration is separately approved (W1 C9, R10: "D15 is not global until F8"). This is an existing approved boundary, not a gap this proposal introduces.
3. **Collision case the evidence does not settle (OT-2).** The Admin of business X holds a central slot for Caterly. The same person is invited as an employee of business Y inside Caterly. If the Admin has a Caterly membership row (how the product recognises the Admin is BC-07, open), Caterly's own uniqueness would catch it; if not, nothing catches it until the product can consult the ledger. **No evidence supports choosing a mechanism, so this is left open.**
4. Phase 2 (a signed, idempotent contract by which a product allocates and releases its employees' slots) is a **design intention only**. It is not an existing contract, it needs the Caterly integration (separately approved), and its cross-database atomicity (the product database and the Platform database cannot share a transaction) is **not designed here (OT-1)**.

#### 3D.6 Technical decisions left open

| ID | Open decision | Why the evidence does not settle it |
|---|---|---|
| **OT-1** | How a product-held slot is written and referenced (who writes, the holder reference, atomicity across two databases, failure and reconciliation) | No contract exists; the Caterly integration is not authorised |
| **OT-2** | How a collision between a central slot and a product-local employee membership is detected before phase 2 | Depends on BC-07 and on OT-1 |
| **OT-3** | Content of the allocation and release audit records | Audit table design is C16 prerequisite 4 |
| **OT-4** | Whether "removal frees the slot" is also enforced in the database (for example a deferred check that no slot has a removed holder) or only by the service | A choice between a stronger guarantee and a heavier schema; no evidence prefers either |
| **OT-5** | How a product-held slot's person and business are verified against the product's own record | Product database is outside Platform Core |

**Concurrency [Technical].** Allocation and holder creation happen in one transaction under `lockOrganisation` (one organisation per transaction). Two businesses racing for one identity are decided by G1; the loser fails whole and maps to a stable refusal code (REF-10). Default `READ COMMITTED`.

**Interaction with D15 [Technical].** G1 **is** D15's database enforcement and adds no membership policy. The ledger's role under per-product management is to be the one place that records exclusivity; the product keeps everything else about its employees.

**Policy points inside SLT-12:** the W1 C8 scope reading (3B, MPS-5), the Admin's own slot on appointment (MPS-8), and immediate reuse (3C, MPS-6).

### 3E. REC-30: wrong-email recovery boundary

**What the existing decisions establish [recorded]:** a recovery is a case (support may open it; authorised Ops staff review) with an optional lock, a 7-day notice to the current Admin, a 30-day checkpoint, and an objection that converts it into a dispute (A-R, B.2, C8 to C12). One authorised reviewer may approve a recovery action and issue the recovery claim (A-H, Y2.1, Y2.2, Y2-A). Consuming a recovery claim appoints the one new Admin (A-R, Admin rule 7). The plan *proposes* the dispute procedure for a wrong-email lock-out and Revision 6 S4 routes it to the same case **[Proposed, not approved]**. Evidence minimums (B3) are A-R+O.

**What stays unresolved:** whether a wrong-email lock-out is opened as a recovery case or a dispute case; any additional evidence for this scenario; staff authority beyond X4; time limits beyond C11 and C12. **None is specified here.**

**Minimum additional decision to close the membership/slot question (MPS-10).** Confirm one routing fact: *a wrong-email lock-out is handled as an ownership-recovery case under the existing workflow (Revision 6 S4), with no new verification rule; an objection converts it to a dispute under the existing C12 rule.* With that, the membership/slot consequence is already determined by 3B and 3D: the replacement appoints the new Admin, and the wrongly-addressed account is a former Admin whose slot follows X3. **Broader recovery policy** (evidence, authority, deadlines) **belongs to the recovery gate** and is not touched.

### 3F. REF-10: refusal behaviour

Approved principles: standard refusal messages, a generic claim-link failure message, a random support reference id, restricted investigation information [A-R+O, R-C1]; every refusal audited, no secrets logged, other-organisation ids internal and access-restricted [A-R+O, R-C2, R-C3]; exact wording approved before release [A-R, R-C4]. This proposal recommends **behaviour**, not final text.

| Aspect | Recommendation [Policy unless noted] |
|---|---|
| Who is told what | **Reveal only what the actor already knows.** A person refused because *their own* email already holds a slot is told so, in generic terms ("this email address cannot be used to create or join a business for this product") plus a support route. A **different** actor (an inviter, a staff member issuing a claim, a transferring Admin) is told only that the action cannot be completed, **never** that the target has an account, a slot or another business. **[Proposed change to existing plan wording; requires AJ's approval, MPS-11. Until approved, the plan's wording stands]** |
| Plan tension | Plan section 3b says the inviter is told "so" without "revealing whose". That still reveals that a membership exists. This proposal recommends that the inviter **not** be told the reason (staff see it by code). That would **change** the effect of the plan's sentence and **requires AJ's approval (MPS-11)**. **This proposal does not alter the plan wording**; if MPS-11 is not approved, the plan's sentence stands |
| Invitee | The refused invitee, once signed in as themselves, may see the reason for their own refusal (they already know their own membership) |
| Support reference | A random id (R-C1), not derived from any business, user or email |
| Internal reason codes [Technical, Proposed] | Stable, never user-visible, one per cause: slot held by the acting user; slot held by the target in another business; slot held by the target in the same business; claim unavailable (expired, revoked, superseded, wrong secret, email mismatch); another pending claim exists; business has an active Admin; ownership locked; concurrent conflict, retry. Revision 5 proposed a code catalogue (including `SLOT_TAKEN_SELF` and `SLOT_TAKEN_TARGET`); **no code is claimed to exist** and none is a contract |
| Consistency | One mapping layer from database constraint and trigger names to reason codes (the invariant design supplies stable names), used by Account and by product flows. The same cause gives the same user-facing class in every flow |
| Errors | A refusal is never a server error (carried Revision 5 rule; EXC-12 provenance unresolved) |
| Audit | Every refusal writes an audit record with the reason code, actor and organisation; no other-business identifier is exposed to the actor |
| Open | REF-07: C4's "an account exists" refusal against the no-enumeration principle. Recommended default: show the generic "cannot complete" class for a normal transfer, with the real reason in the staff view; AJ decides (**MPS-12**) |

## 4. Reconciled membership and slot lifecycle

### 4.1 Event-by-event

"Central" = `organisation_members` / Admin rows. "Slot" = the ledger. "Product" = the product's own membership. All effects are Proposed except where an approval is cited.

| Event | Central effect | Slot effect | Product effect | Source |
|---|---|---|---|---|
| New business (O1) | Creator is the initial Admin | Creator's slot allocated | Product link; creator's product access per BC-07 (open) | A-H W1 C7; A-R Admin rule 2 |
| Unclaimed business | No Admin, `admin_established = false` | None | None | AJ-P (P1) |
| Claim issued | None | None; slot checked at issue | None | Plan 3b; 3A item 3 |
| First ownership claim consumed (class A; class O only if Decision M so decides) | `replaceAdmin(none)` | Recipient's slot allocated or reused (C7-3b) | Per BC-07 | 3A; invariant design |
| Normal transfer accepted | `replaceAdmin(expected = initiator)`; former Admin `disabled` | New Admin's slot allocated (MPS-8); former Admin's slot disposed (X3) by the route | Per BC-07; former Admin stays or leaves (C2) | A-H A2; 3B |
| Recovery claim consumed | Same | Same | Same; pending offer revoked (C13) | A-R Admin rule 7; C13 |
| Employee invited and accepts (product) | None (C6) | Slot allocated (phase 2: through the contract) | Product membership created | A-R C6; A-H D13 |
| Member disabled | None unless an Admin row (then the floor applies) | **Unchanged** | Product decides | A-H W1 C8 |
| Member removed or leaves | A removed Admin row only under approved exceptions (B2) | Freed; reusable at once **only if MPS-6 is approved** (until then SLT-10 is open) | Product membership removed | A-H W1 C8; SLT-10 |
| Unlink a product | None | That product's slots deleted | Product link removed | A-H W1 C8 |
| Link a product | None | Central members checked as a whole (W1 C7) | n/a | A-H W1 C7 |
| Wrong-email lock-out | Recovery case; replacement as above | Former (wrong-address) account's slot via X3 | Per BC-07 | 3E |

### 4.2 Consistency with the approved decisions

| Constraint | Holds? |
|---|---|
| C4 (nominee entirely new) | Yes: unchanged, not extended |
| C5 (central membership grants no product permissions) | Yes: the ledger records exclusivity only |
| C6 (employees product-managed, no central record) | Yes: employee slots are product-held (phase 2) |
| D15 (one per user per product, database, another email for another kitchen) | Yes: `UNIQUE (user_id, product_key)` |
| Invariant design (I-7: replacement has no slot or product side effect) | Yes: slot steps belong to the route, not to `replaceAdmin` |
| W1 C8 (disabled keeps the slot; removal frees; unlink deletes) | Yes, with the scope reading to confirm (MPS-5) |
| A2 (transfer atomic, no holding state) | Yes: used only for transfer; SLT-10 is a separate question that stays open until MPS-6 |
| P6 (reappointment deferred) | Yes: no rule here decides it |
| B.2, C8 to C14, D1, X4, X5, Y2 | Unchanged |

### 4.3 Scenario checks (design-level; none written or run)

| # | Scenario | Expected |
|---|---|---|
| M-1 | Two businesses race to give one identity a slot for one product | Exactly one commits; the other fails whole with the slot-held refusal code |
| M-2 | A pending claim exists; the recipient joins another business first | Consumption is refused at the re-check; no reservation existed |
| M-3 | Two claims in the same group are issued to one business | The second is refused (different email) or supersedes (same email) |
| M-3b | An ordinary claim is pending and a recovery claim is issued | Both may be pending; whichever commits first decides; the other fails the expected-previous check; one active Admin |
| M-4 | Recovery claim consumed while a transfer is pending | The offer is revoked; the nominee is notified; one active Admin |
| M-5 | Member disabled, then another business tries to give them a slot | Refused (slot kept) |
| M-6 | Member removed, then another business adds them at once | Allowed **if MPS-6 is approved**; otherwise undecided |
| M-7 | Central Admin replaced; former Admin kept as employee | Slot re-pointed, never freed (X3); under the interim, retained |
| M-8 | `replaceAdmin` run alone | No slot or product-membership row changes |
| M-9 | Refused invitation | The inviter sees only the generic class; staff see the code; the invitee, signed in, may see their own reason |

## 5. Decisions (status as of 2026-11-06)

| ID | Decision | Recommended answer | If AJ disagrees |
|---|---|---|---|
| MPS-1 **(approved 2026-11-06)** | C7-1 **(revised)**: at most one pending ordinary claim (O or A) and, independently, at most one pending recovery claim (R) per business | Approve | Choose a combined limit, N, or recovery priority (3A.1) |
| MPS-2 **(approved 2026-11-06)** | C7-2: no new blocking rule for classes A and R; class O left to Decision M | Approve | Specify what blocks what |
| MPS-3 **(approved 2026-11-06)** | C7-3: C4 not extended to claims (classes O, A, R) | Approve | State who must be new |
| MPS-3b **(approved 2026-11-06)** | Recipient may already hold a slot in this same business | Yes, reuse | Say refuse, and how a current employee becomes Admin |
| MPS-4 **(not separately approved; follows MPS-1)** | C7-4: replaced by MPS-1 | Approve | n/a |
| MPS-5 **(approved 2026-11-06)** | EXC-14: slot follows the product membership (X3), read from W1 C8; interim retention | Approve | X1 or X2 |
| MPS-6 **(approved 2026-11-06)** | SLT-10: **recommendation only**: no cooling-off; freed by removal, leaving, unlink; no residual state. Makes A1 a full approval and resolves the plan's two conflicting statements | Approve | Choose a hold and a duration |
| MPS-7 **(approved 2026-11-06)** | SLT-12: ledger with a slot instance identified by `slot_id`; D15 `(user_id, product_key)` uniqueness (G1) and holder consistency (G2) as separate guarantees; no state column; two phases; history as separate events (3D.4). OT-1 to OT-5 stay open | Approve | Choose product-local or fully central, or in-table history |
| MPS-8 **(approved 2026-11-06)** | The new Admin takes a slot on appointment (O1 symmetry) | Yes | Say what an Admin's product place is, which touches BC-07 |
| MPS-9 **(approved 2026-11-06)** | C7-5: same-email reissue supersedes the previous claim; different-email reissue revokes it | Approved | n/a |
| MPS-10 **(deferred; open)** | REC-30: confirm the wrong-email lock-out routes to the existing recovery workflow | Approve | Name another workflow |
| MPS-11 **(deferred; open)** | REF-10: inviter and other actors never learn the target's membership. **A change to existing plan wording; not approved; requires AJ's approval** | Approve | Keep the plan wording as it stands |
| MPS-12 **(deferred; open)** | REF-07: generic class for a normal-transfer account-exists refusal | Approve | Choose disclosure |
| MPS-13 **(approved 2026-11-06)** | Confirm that a slot is **not** a capacity or seat unit and that no fixed slot count exists (none is established in the sources) | Confirm | State the capacity rule separately; it is not designed here |
| MPS-14 **(approved 2026-11-06)** | Who may revoke a pending ownership claim, whether this differs by class, and the required reason, case reference and audit; **revocation by an authorised actor and recipient decline are separate events** (section 3A.3). The revised C7-1 and C7-5 depend on it | Option A: separate Ops permission; recipient decline as a separate event; the Business Admin may not revoke a recovery claim | Option B, C or D, or another rule |
| MPS-15 **(not approved; recovery-claim replacement proposal)** | Recovery claim replacement: explicit atomic replacement (P4) by an authorised Ops actor at the new case's issue step; opening or advancing a case never revokes a claim (section 3A.1) | Approve | Choose wait-for-expiry, revoke-then-issue, or another rule |

## 6. What still stays open, and what approval would do

**Not touched or decided here:** Decision M (including what an Owner claim, class O, confers and whether class A exists), BC-07 (the Admin's product access, which governs the product-side outcome for a former Admin), P6, CLM-02, CLM-20, CLM-08, NOT-10, TR-06, TR-21, TR-23, ADM-04 to ADM-08, E-29, REC-35, EXC-08, EXC-13, E2, audit table content (prerequisite 4), the recovery procedure beyond routing, and any refusal text.

**Dependency worth stating plainly.** X3 and the Admin's own slot (MPS-8) cannot be fully exercised until BC-07 says how the product recognises the Admin and the product can report membership. The design is stated so that it works with the interim rule until then.

**Approval recorded (2026-11-06).** C16 prerequisite 3 is **fully satisfied** on the decisions in section 0.1: all five C7 matters are decided (MPS-1, MPS-2, MPS-3, MPS-9, and MPS-4 as the consequence of MPS-1). The items listed as open in section 0.1 (MPS-10, MPS-11, MPS-12, MPS-15, OT-1 to OT-5, Decision M, BC-07, P6 and the rest) are carried forward and are not resolved by this record. **MPS-15** remains the recovery-claim replacement proposal and is not approved: MPS-9 decides what a reissue does to the previous claim, while MPS-15's further points (who authorises a replacement by a new recovery case, and the record it needs) are not approved. Prerequisites 4 (schema and audit-table decisions) and 5 (implementation and migration approvals) stay outstanding, and `F3.2.1` stays unauthorised until all five are met.

## 7. Non-goals and assumptions

**Non-goals.** No schema, migration, trigger or code; no audit-table content; no claim-table design beyond the one-pending-per-business consequence; no UI; no refusal text; no recovery evidence, steps, authority or time limits; no change to Caterly, Rivo or Ops; no edit to any other document.

**Assumptions.** (1) The Single-Business-Admin design is approved (recorded in `.claude/STATUS.md` on 2026-11-06 on AJ's instruction). (2) The Caterly integration (F8) remains separately approved and not yet authorised, so phase 2 product-held slots are a design intention only. (3) The default `READ COMMITTED` isolation and the one-organisation-per-transaction rule of the W1 plan stand. (4) The recommended rules are Proposed: nothing here is policy until AJ approves it.
