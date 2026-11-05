# F5.1.0 Ownership-flow specification (DRAFT for AJ's review)

Drafted 2026-11-04; revision 5 (same day); AJ decisions are recorded in sections 0A to 0E. Task: `F5.1.0` in `docs/platform-foundation-plan.md` (Part 3 section 6): "Turn O1 to O4 into a precise spec and test plan; no code", including the D15 enforcement points, the three open questions and the invitation rules.

**Status of this document**
| Statement | State |
|---|---|
| This is a draft | Not accepted. **F5.1.0 is not accepted.** AJ has not decided any proposal below |
| Authorisation | Nothing here authorises `F3.2.1`, any schema, migration, code, database operation, notification or staff tooling. Accepting this spec would not by itself authorise `F3.2.1` either; that needs its own approval |
| Existing documents | `docs/platform-foundation-plan.md`, `docs/w1-implementation-plan.md` and `docs/gate-b1-decision-record.md` are not changed by this draft. Where this draft would change an approved rule, it says so and puts the question to AJ |
| Source of facts | The three documents above, `docs/platform-audit.md`, `.claude/STATUS.md`, `.claude/CONTEXT.md` and `.claude/HANDOVER-2026-11-04-f311-stage2.md`. Nothing was run and no database was read |
| Revision | Revision 5 (2026-11-04) records AJ's four follow-up decisions to the Y2 decisions, recorded as Y2-A to Y2-D (section 0E.5): one staff reviewer confirmed (Y2-A); a security investigation qualifies as a case for revoking a suspicious pending offer (Y2-B); the system expires a recovery claim after its 14-day validity (Y2-C); staff viewing of customer business information is audited (Y2-D). Revision 4 (the six Y2 decisions) is kept in section 0E. Earlier revisions are kept in the session scratchpad (`f5-draft-rev1.md` to `f5-draft-rev4.md`) |
| Still open | A1, B1 (who may open a case or set the lock), B2 to B5, C1 to C4, D1, X4 (the staff identity model), Y1 and Y3 to Y6 (section 5.2a), and the gaps in 0E.4. X5 is AJ's proposed decision, for review. None is approved by recording the other decisions |

**Labels used in every table**
| Label | Meaning |
|---|---|
| **[Approved]** | Already decided by AJ and recorded in the plan or the Gate B-1 record. Quoted, not changed |
| **[Documented]** | Written in the plan as a rule or proposal but not separately approved, or approved only as part of a larger decision |
| **[Proposed]** | New in this draft. Needs AJ's decision. Never to be read as approved |
| **[AJ decision]** | A decision AJ gave on 2026-11-04, recorded here for review. Not yet written into the approved plan documents, so it can conflict with their literal wording (section 0B) |
| **[Unresolved]** | A case where the documents give no answer, or disagree. Behaviour is deliberately not invented |

**Source references.** "Part 1 section n" and "Part 3 section n" mean the sections of those parts of `docs/platform-foundation-plan.md` (the file has several parts with their own numbering).

---

## 0A. AJ decisions recorded (revisions 2 to 4, for AJ's review)

On 2026-11-04 AJ gave decisions on this draft. They are recorded below **as AJ decisions for review**; X5 is AJ's **proposed** decision. They are not yet written into `docs/platform-foundation-plan.md`, `docs/w1-implementation-plan.md` or `docs/gate-b1-decision-record.md`, and this draft does not change those documents. Recording a decision here does not accept `F5.1.0`, does not approve any other open decision (the register is in 5.2a) and does not authorise `F3.2.1`.

| ID | AJ's decision (as given) | Effect on this draft | Result of the check against the approved documents |
|---|---|---|---|
| X1 | AJ agrees with the existing D15 identity model: one membership per Platterly product; a person may belong to different businesses across different products; a person cannot have multiple memberships within the same product. The approved D15 rule is retained and the slot uniqueness design is not changed | Confirms the reading in 0.1. The earlier brief's stricter wording ("cannot belong to multiple businesses") is superseded for the cross-product case. `membership_product_slots` keeps `UNIQUE (user_id, product_key)`. E-13 becomes covered | Consistent with Part 3 section 3b (one membership per product; "different products are independent"), the Gate B-1 record and the W1 plan slot table. The approved text does not say in words that the two memberships may be in different businesses; that follows from the slot key, and this decision now states it. No conflict, no plan change needed |
| X2 | A separate ownership-offer flow must be used. A standard employee invitation must never independently grant Owner authority | Owner is never reachable through I1 or I2. An Owner is added by an ownership offer, which is part of the O3 flow (sections 3.3 and 5.2). Mechanics are not decided (0C) | Consistent with Part 3 section 3a ("Owner access never travels by invitation"), Part 3 section 4 ("Owner role only via O2/O3") and the I1 definition ("never Owner"). **Contradicts the literal wording** of O3 and of Part 1 section 12 (0B, items 1 and 2). The W1 plan has no invitation or offer table (its section 6 puts invitations in `F5.2.1`) and the Gate B-1 record only sets the invitation uniqueness rules |
| X3 | Only an existing Owner may initiate a normal O3 ownership transfer. Staff must use the ownership recovery process instead | Staff never start O3. Staff act through a recovery case and an O2 claim (sections 2.B, 3.3, 3.4) | Consistent with Part 3 section 4 ("Initiate ownership transfer (O3): Owner, fresh auth; Admin, Manager, Member: No") and with O3's own text ("Owner (fresh auth) names a target"). **Conflicts with Part 1 section 2** ("current owner or staff with audit") (0B, item 3) |
| X5 | **AJ's proposed decision, for review.** The initiating Owner can cancel an offered transfer before acceptance. The target can decline the offer. Other Owners cannot independently cancel the offer. Staff may revoke an offer only through an authorised recovery or dispute procedure, with an audit record (revision 5: AJ's Decision Y2-B adds an authorised security investigation, on four conditions, as a case through which a suspicious pending offer may be revoked; see 0E.5) | Sections 3.1, 3.3 and 3.8 and the register (E-18, E-22, E-23) | O3 says only that a transfer "expires in 7 days; one pending transfer per business; blocked while `ownership_locked`", and lists "abandoned" and "cancelled" as test names without saying who cancels, so there is **no literal conflict**. It leaves five gaps (0B, items 6 and 7, and sections 3.8 and 5.2): the Part 3 section 4 matrix has no cancel or decline row; fresh authentication for cancelling is undefined (Y6); staff revocation is new (the plan has only the lock block and the proposed D1); other Owners have no veto, which matters for E-04; and an initiator who stops being an Owner (E-18) |
| A2 | No additional cooling-off period. Retain the existing atomic O3 transfer on acceptance. Do not introduce the proposed 72-hour holding state or activation job | The `holding` state, the activation job, the pending-Owner-during-hold rule and the cancel-during-hold workflow are removed (2.A.2, 3.1, 3.3, 3.8). The 7-day offer expiry and the separate 72 h email-change hold are kept | No contradiction. Matches O3 (atomic on acceptance), the W1 plan's transfer-at-full-cap test and CL-7 and CL-8. The risk it leaves open is E-04 |
| A3 | Defer the independent out-of-band notification mechanism. Leave it unresolved for later design. Do not introduce a new recovery-contact field or assume the Ops billing contact is suitable | No new field, no second channel, no use of the Ops billing contact (2.A.3). The compromised sole-Owner scenario stays an unresolved security risk (E-04). **Email notices are not claimed to mitigate it** | No contradiction. The plan stores no recovery contact, and `owner.changed` updates the Ops billing contact from the Owner's email, so it is not an independent channel either |
| Y2 | Six decisions on actors (staff authority; staff approval; staff access to customer businesses; system actors; mandatory audit information; initiator and executor). Full text in section 0E | Section 0E, and the dependent text in 1.4, 2.B (steps 5 and 6, B.5), 3.2, 3.5, 3.8, C.3, E-14 and E-25 to E-30, 5.2, 5.2a, 5.3.1 and 5.4. **No staff database model, identity provider, permissions schema or technical design is defined** | Consistent with X3, the claim process and the approved expiry rules. **Conflicts with Part 1 section 12** ("decision by AJ plus a recorded second reviewer where possible") (0B item 9) and its earlier tension with X5 on revoking an offer is reconciled by Decision Y2-B (0B item 10). Gaps are listed in 0E.4 |
| Y2-A | One authorised Platterly staff member is sufficient to investigate and approve an ownership recovery action; a second reviewer is not mandatory. Contradictory wording removed or corrected; no new two-person approval requirement | 2.B step 5 and B.5, 3.5, X4 and B1 rows, E-14 (kept as an unresolved risk). The plan's "second reviewer where possible" text remains only where it is quoted and labelled as the plan's wording (0B item 9) | Confirms Y2.2. Conflicts with the quoted Part 1 section 12 and `F5.3.2` wording (0B item 9); the plan itself is unchanged |
| Y2-B | A security investigation qualifies as an authorised case for revoking a suspicious pending ownership offer, on four conditions: a genuine security concern; explicit authorisation of the staff member; a recorded reason; capture in the audit trail | 0E.5, 1.4, 3.1, 3.3, 3.8, 0B item 10, 0D item 1, E-22, E-28, E-31 | Reconciles X5 and E-28. Not broader than AJ's decision: pending offers only; ordinary support activity or an unsupported suspicion is not a reason. The threshold for "genuine" is undefined (E-31) |
| Y2-C | The system automatically expires an ownership recovery claim after its approved 14-day validity period. A predefined system action, not an ownership decision | 0E.1 (Y2.4), 0E.3, 0E.5, 1.4, 3.1, 3.2 | Consistent with the plan's 14-day claim rule, which is not changed. No renewal process is invented. D1 stays open |
| Y2-D | Staff viewing of customer business information is audited even when nothing is changed: staff identity, business accessed, date and time, associated case, reason for access | 0E.2a, 0E.3, 0E.5, C.3, E-25, E-32, 5.4 | Integrates with the seven audit details. Recording is approved; no access system, access policy, duration, support workflow or permissions model is designed |

### 0B. Contradictions with existing approved wording (not resolved by editing the approved documents)

Proposed replacement wording for items 1 to 5, 8 and 9 is in section 0D. Nothing in the approved documents has been changed.

| # | Approved wording | Where | Conflicts with | How this draft treats it |
|---|---|---|---|---|
| 1 | O3: the owner "invites by email which becomes an invitation as Owner" | Part 3 section 3, O3 row | X2 (and Part 3 section 3a) | Follows X2: an ownership offer, not an invitation. Proposed wording: 0D item 1 |
| 2 | "Adding an owner uses the two-party flow (invite as Owner, accepted by a verified email)" | Part 1 section 12, "Multiple owners" | X2 (and Part 3 section 3a) | Same. 0D item 2 |
| 3 | An owner transfer may be started by the "current owner or staff with audit" | Part 1 section 2, "Ownership reissue after consumption" | X3, Part 3 section 4 and O3 | Follows X3 (Owner only; staff use recovery). 0D item 3 |
| 4 | Re-ownership after consumption is "not a claim", while the recovery procedure ends in "a new claim to a verified email" for a business that already has an owner | Part 1 sections 2 and 12 | Each other (existed before the decisions) | The proposed wording states when a claim is used (0D item 4) |
| 5 | The old owner "becomes Admin unless removed" | Part 1 section 2, same row as item 3 | O3: "initiator chooses to stay Owner, step down to Admin, or be removed" | Follows O3. Settled by 0D item 3 |
| 6 | Part 3 section 4 permission matrix has a row "Initiate ownership transfer (O3)" but none for cancelling or declining an offer | Part 3 section 4 | X5 (a gap, not a literal conflict) | 0D item 5 proposes a row; fresh authentication for it is Y6 |
| 7 | The plan lets staff lock ownership changes (O3 is "blocked while `ownership_locked`") and re-issue or revoke **claims**, but says nothing about staff revoking an offered transfer | Part 3 section 3, Part 1 section 2 | X5 (new capability) | Included in the 0D item 1 wording; needs staff identity (X4) |
| 8 | Part 1 section 2, "Expired": "Staff **or the existing owner** re-issues from Ops/Account". O2 says "Staff or Ops issues a claim" | Part 1 section 2 against Part 3 section 3 | Each other; also touches the spirit of X3 (an Owner creating Owner authority outside O3) | Not decided. Optional wording in 0D item 6. Found while checking X3 |
| 9 | "decision by AJ plus a recorded second reviewer where possible, then a new claim to a verified email"; and `F5.3.2`: "Dual-control where possible" | Part 1 section 12 ("Ownership dispute or lost access"); Part 3 section 6, `F5.3.2` | Y2.2: one authorised staff member is sufficient and a second approval is not mandatory | Follows Y2.2, and Decision Y2-A (revision 5) confirms it explicitly: one authorised staff member is sufficient and no second review is required or implied. "Where possible" never made a second reviewer mandatory, but the decision-maker changes from AJ to an authorised staff member. Proposed wording: 0D item 7 |
| 10 | (Not approved wording: AJ's proposed decision X5) staff may revoke an offer "only through an authorised recovery or dispute procedure" | Section 0A and 3.8 of this draft | Y2.1: staff may "revoke suspicious pending ownership offers" | **Reconciled by AJ's Decision Y2-B (revision 5):** a security investigation qualifies as an authorised case, on four conditions (0E.5). Ordinary support activity or an unsupported suspicion does not. What makes a concern "genuine" is not defined (E-31) |

### 0C. X2: what AJ decided and what is not decided

| Decided by AJ | Not decided (working labels only; none of this is a requirement) |
|---|---|
| A separate ownership-offer flow exists. A standard employee invitation (I1 or I2) can never independently grant Owner authority | The name ("ownership offer" is a working label). Whether offers use their own table or the `ownership_transfers` table already named for `F5.3.1`. The token format and how it is stored (I1 uses a secret token separate from the id; nothing is set for offers). The lifecycle states (`offered`, `completed`, `declined`, `cancelled`, `revoked`, `expired`, `refused` in section 3.1 are working labels; only the 7-day expiry comes from O3). Whether an offer may reach a person without an account, or only an existing user (O3 allows both). How an offer interacts with the invitation rules (one pending invitation per organisation and `lower(email)`, supersede on accept). What "independently" excludes in detail, for example one sign-up that accepts both an I1 invitation and an offer for the same email. Notification wording (D5) |

Under A2 the offer keeps O3's existing rules: expiry in 7 days, acceptance while signed in with a verified email, target must hold no slot for the product, authority at acceptance in one transaction.

### 0D. Proposed amendments to the approved plan wording (for AJ's review; the plan is NOT changed)

These are drafts of replacement wording only. They change nothing until AJ approves them as a separate documentation task (Y1). Each keeps the rest of the cited text as it is.

| # | Where | Current wording (quoted) | Proposed replacement | Depends on |
|---|---|---|---|---|
| 1 | `docs/platform-foundation-plan.md` Part 3 section 3, O3 row | "Owner (fresh auth) names a target user, or invites by email which becomes an invitation as Owner. Target accepts while signed in with a verified email. One transaction adds `Owner` (cap 3); initiator chooses to stay Owner, step down to Admin, or be removed. Expires in 7 days; one pending transfer per business; blocked while `ownership_locked`." | "Owner (fresh auth) names a target user, or makes an **ownership offer** to an email address. An ownership offer is a separate flow from team invitations (I1, I2); an invitation never carries the Owner role. Target accepts while signed in with a verified email. One transaction adds `Owner` (cap 3); initiator chooses to stay Owner, step down to Admin, or be removed. Expires in 7 days; one pending transfer per business; blocked while `ownership_locked`. Before acceptance the initiating Owner may cancel the offer and the target may decline it; no other Owner may cancel it; staff may revoke a pending offer only through the ownership recovery or dispute procedure, or through an authorised security investigation (genuine security concern, explicit authorisation, recorded reason, audit trail), with an audit record." | X2, X5, Y2-B |
| 2 | Part 1 section 12, "Multiple owners" | "Adding an owner uses the two-party flow (invite as Owner, accepted by a verified email)." | "Adding an owner uses the two-party O3 flow: the Owner names an existing user or makes an ownership offer to an email address, and the target accepts while signed in with a verified email. An invitation never carries the Owner role (Part 3 section 3a)." | X2 |
| 3 | Part 1 section 2, row "Ownership reissue after consumption" | "Not a claim: an **owner transfer** (current owner or staff with audit, new owner accepts, two-party). Old owner becomes Admin unless removed" | "Adding or handing over an Owner after the first claim was consumed is an **owner transfer** (O3, Part 3 section 3): started only by an existing Owner with fresh authentication and accepted by the new owner (two-party). The initiating Owner stays Owner, becomes Admin or is removed, as chosen at the start. Staff never start a transfer. When no Owner can act, staff run the ownership recovery procedure (section 12), which ends in a new claim to a verified email." | X3 |
| 4 | Part 1 section 2, first lines (the claim definition) | "A claim = `(claimId, businessId, role=owner, boundEmail, status, expiresAt, issuedBy, supersedes)`. Statuses: `pending`, `consumed`, `expired`, `revoked`, `superseded`." | Add: "A claim is issued by staff or Ops in three cases: to establish the first Owner of a business that has none; for a further legitimate Owner, including migrated customers (O4); and as the last step of the ownership recovery procedure (section 12), where it replaces an Owner who cannot act. An Owner never uses a claim to hand over their own role; that is a transfer." | X3 |
| 5 | Part 3 section 4, permission matrix | (no row) | Add a row: "Cancel an offered transfer before acceptance: Owner (the initiating Owner only; fresh authentication, see Y6), Admin No, Manager No, Member No. Notes: the target declines by answering the offer; staff revoke only through the recovery or dispute procedure." | X5, Y6 |
| 6 | Part 1 section 2, row "Expired" (optional, not required by any decision so far) | "Staff or the existing owner re-issues from Ops/Account; re-issue creates a new claim, marks the old `superseded`." | "Staff re-issue from Ops or the platform staff tooling; re-issue creates a new claim, marks the old `superseded`. An existing Owner who wants to add another Owner uses an O3 transfer." | AJ's call (0B item 8) |
| 7 | Part 1 section 12, "Ownership dispute or lost access" | "decision by AJ plus a recorded second reviewer where possible, then a new claim to a verified email." | "decision by an authorised Platterly staff member (one is sufficient; a second approval is not mandatory), then a new recovery claim to a verified email. Staff never assign or transfer ownership; the new Owner completes the claim process. Every step is audited with the actor, the case and the approval details." | Y2.1, Y2.2, Y2-A, Y2.5 |

### 0E. Y2 decisions: staff, customer and system actors (AJ's decisions, for review)

AJ's Y2 decisions set the **authority, approval and audit rules** for the three kinds of actor. My earlier Y2 question was narrower (the column reference for a staff or system actor). These decisions answer the policy; they do **not** choose any storage design. This draft does not define a staff database model, a staff identity provider, a permissions schema or any technical implementation, and does not set a permanent or temporary access policy.

**0E.1 The six decisions, how they are represented, and the check**
| # | AJ's decision (as given) | Where it is represented | Check against the approved documents |
|---|---|---|---|
| Y2.1 | **Staff authority.** Platterly staff may: lock access when there is a credible security concern; investigate ownership and access problems; revoke suspicious pending ownership offers; issue a new ownership recovery claim after completing the verification process. Staff must never directly assign or transfer business ownership. The new Owner must complete the secure claim process | 1.4; 2.B steps 5 and 6; 3.4; 3.8; E-22, E-27, E-28, E-29 | Consistent with X3 (staff never start O3), with O2 (a claim is consumed by the new Owner) and with the recovery steps. Revoking a suspicious pending offer is reconciled with X5 by Decision Y2-B (revision 5). "Lock access" is wider than the one lock the plan has, `ownership_locked` (E-27). Disabling or removing the previous Owner in recovery (B2) is neither "assign" nor "transfer" and is not covered (E-29) |
| Y2.2 | **Staff approval.** One authorised staff member is sufficient to investigate and approve a recovery action and issue a recovery claim. A second staff member's approval is not mandatory. Recovery permissions must be explicitly restricted to authorised staff; ordinary support staff must not automatically receive them | 2.B steps 5 and 6 and B.5; 3.2; 3.5; E-14; X4 and B1 in 5.2 | **Conflicts with Part 1 section 12** ("decision by AJ plus a recorded second reviewer where possible") and `F5.3.2` ("Dual-control where possible") (0B item 9). My earlier recommendation of a mandatory second reviewer is withdrawn. Confirmed explicitly by Decision Y2-A (revision 5). Who counts as "authorised" and who authorises is not decided (X4) |
| Y2.3 | **Staff access to customer businesses.** Authorised staff may have limited access to relevant business information when handling support or recovery matters. This does not make them members or employees of the customer's business and grants no Owner-level authority. Detailed support workflows and access-management arrangements are deferred. No permanent or temporary access policy is to be invented now | 1.4; E-25 | Consistent with D15 (staff hold no membership and no slot) and with Part 1 section 12 ("billing and data untouched"). "Relevant business information" is undefined, and so is whether staff reads are audited. The evidence steps in 2.B (members list, registered phone, documents) assume some access that is deferred |
| Y2.4 | **System actor authority.** System actors are automated Platterly processes. They may execute predefined, approved actions: expiring ownership offers after the approved seven-day period; expiring invitations by their approved rules; recording audit events; enforcing approved access restrictions; executing routine account processes. The system must not independently make discretionary ownership decisions, resolve ownership disputes or assign business ownership | 1.4; 3.1; 0E.3 | Consistent with O3 (7 days), I1 (48 h), I2 (14 days), the 72 h email-change hold and the block while `ownership_locked`. Claim expiry (14 days) is confirmed as a predefined system action for recovery claims by Decision Y2-C (revision 5). The proposed extension of frozen items by the lock length (D1, open) would only be a predefined rule if AJ adopts it |
| Y2.5 | **Mandatory audit information.** For every relevant staff, customer or system action, record all seven details (0E.2) | 0E.2; C.3; 3.1 to 3.8 audit rows; 5.4 | The plan's audit pattern (actor, action, subject, before and after) and the W1 plan (`audit_logs` "table only here") do not define these fields. "No secrets logged" and "the claim email stays only in the audit log" are unaffected. Gaps: the source of a case reference, and the identity of an unauthenticated actor (0E.4) |
| Y2.6 | **Initiator and executor.** When a person initiates or authorises an action that is executed automatically, record both separately. Do not attribute the decision to the system merely because the system executed it | 0E.3; 3.2; 3.8 | Needs two actor references in one record. The plan's `resolved_by` and `unlinked_by` columns hold one actor each. Design not decided |

**0E.2 The seven mandatory audit details** (for every relevant staff, customer or system action)
| # | Detail | How it applies, and what is undefined |
|---|---|---|
| 1 | Actor category | customer, Platterly staff or system |
| 2 | Exact actor identity, or the system process identity | A customer is identified by their user id. How a staff member is identified is not decided (X4). System process identities are not named here |
| 3 | Action performed | For a rule-driven action, the action states the predefined rule (for example "offer expired after seven days"); for a staff view, "viewed customer business information" (Decision Y2-D) |
| 4 | Affected business | The organisation the action concerns |
| 5 | Date and time | |
| 6 | Reason, or the associated support or recovery case, where applicable | A support or recovery case record is not designed (`F5.3.2` names an "evidence record"); where the reference comes from is open. For a staff view of customer business information (Decision Y2-D) the case and the reason are both required |
| 7 | Approval details, where applicable | For a recovery, who approved and when. With one authorised staff member sufficient (Y2.2), the approver may be the same person as the initiator |

What counts as a "relevant" action is not defined beyond ownership and access actions, except that **Decision Y2-D (revision 5) settles that staff viewing of customer business information is relevant and must be recorded, even when staff make no changes** (0E.2a). Secrets, tokens, OTPs and hashes are still never recorded.

**0E.2a Staff viewing of customer business information (AJ's Decision Y2-D)**
| # | Y2-D item | Corresponds to |
|---|---|---|
| 1 | Staff member's identity | Details 1 and 2 (category: Platterly staff; exact identity, whose model is undecided, X4) |
| 2 | Business accessed | Detail 4 |
| 3 | Date and time | Detail 5 |
| 4 | Associated support or recovery case | Detail 6 |
| 5 | Reason for access | Detail 6 |

The action performed (detail 3) is "viewed customer business information". Approval details (detail 7) apply only where an approval exists. The decision lists the case and the reason as items of the record, so a record without them is incomplete; what the system does when one is missing (for example refusing the view) is **not decided**.

Recording staff access is approved. **Not approved and not invented here:** the complete support access-management system, a permanent or temporary access policy, access durations, new support workflows or a technical permissions model. Also undecided: what counts as one "view" (a page, a record, an export), how long the record is kept and how it is protected (E-32).

**0E.3 Initiator and executor (illustrations only; process identities are not named)**
| Action | Initiated by | Executed by | Decision attributed to |
|---|---|---|---|
| Recovery claim issued | Authorised staff member (who also approved) | System | The staff member, not the system |
| Ownership lock set | Authorised staff member | System | The staff member |
| Pending offer revoked | Authorised staff member | System | The staff member (with the case reference) |
| Offer cancelled by the initiating Owner (X5) | Customer (the Owner) | System | The Owner |
| Offer declined | Customer (the target) | System | The target |
| Claim consumed or transfer accepted | Customer (the claimant or target) | System | The customer |
| Offer expired after seven days | System process under the predefined rule | System | No human decision |
| Invitation expired by its approved rule | System process under the predefined rule | System | No human decision |
| Recovery claim expired after 14 days (Decision Y2-C) | System process under the predefined rule | System | No human decision. The system cannot approve a claim, reject a dispute or assign ownership |
| Staff view of customer business information (Decision Y2-D) | Authorised staff member | System (serves the information and writes the record) | The staff member |

**0E.4 Gaps and open points created or left by the Y2 decisions** (nothing here is resolved by this draft)
| # | Gap |
|---|---|
| 1 | What "lock access" covers. The plan has the ownership lock (`ownership_locked`); user-level revocation is reserved for compromise events (Part 1 section 11). Whether staff may also disable a user, a membership or a product link is not stated (E-27) |
| 2 | **Resolved in principle by Decision Y2-B (revision 5):** a security investigation qualifies as an authorised case for revoking a suspicious pending offer, on four conditions (0E.5). Still open: what makes a concern genuine and who may open an investigation (E-31) |
| 3 | Who may open a case or set the lock. Y2.2 restricts "recovery permissions"; whether opening a case or locking belongs to them, or to ordinary support staff, is not stated (B1) |
| 4 | Who issues claims that are not recovery claims (the first Owner of an Ops-provisioned business, migrated customers, O4). The plan says "staff or Ops"; Y2 speaks of recovery claims only |
| 5 | Disabling or removing the previous Owner during recovery (B2): "never directly assign or transfer" does not say whether staff may do this directly or only through a predefined process (E-29) |
| 6 | What staff may see, for how long, with what approval (deferred by AJ; E-25). **Auditing every staff view is decided (Decision Y2-D)** |
| 7 | The audit identity of an unauthenticated or unknown actor, for example a failed claim attempt (E-26) |
| 8 | Where the support or recovery case reference comes from (no case record exists in the plan beyond the "evidence record" of `F5.3.2`). Decisions Y2-B and Y2-D make this more important: each staff view and each security-investigation revoke is recorded against a case |
| 9 | **Resolved for the 14-day recovery claim by Decision Y2-C** (a predefined system action). Still open: the D1 extension (not adopted by Y2-C) and the expiry of other claims (row 15) |
| 10 | Ops as an actor: whether an action started in Ops is staff or system (E-30) |
| 11 | The audit table design: two actor references (initiator and executor), a case reference, approval details and the five-item staff-view record (Y2-D) are required; the plan defines none. A foreign key to `users` versus a text reference for staff and system identities is a design choice that this draft does not make |
| 12 | The approved plan wording about a second reviewer (0B item 9) is unchanged until AJ approves an amendment (0D item 7). Decision Y2-A confirms the intent |
| 13 | What makes a security concern "genuine" for revoking a pending offer (Y2-B), who may open a security investigation, and whether it has a case record (E-31) |
| 14 | What counts as one staff "view", how long the record is kept, how it is protected, and what happens when the case or reason is missing (E-32) |
| 15 | Y2-C names the expiry of a **recovery** claim. The same 14-day expiry of other claims (first Owner, migrated customers) is a plan rule but is not named in Y2-C |

**0E.5 Follow-up decisions Y2-A to Y2-D (AJ, revision 5)**

AJ called these Decisions A to D. They are recorded as **Y2-A to Y2-D** so that they cannot be confused with A1 to A3, B1 to B5, C1 to C4 and D1.

| ID | AJ's decision (as given) | How it is represented | Check and interaction |
|---|---|---|---|
| Y2-A | One authorised Platterly staff member is sufficient to investigate and approve an ownership recovery action. A second reviewer is not mandatory. Remove or replace contradictory wording; do not introduce a two-person approval requirement; keep the single-person risk documented as unresolved | 2.B step 5 and B.5, 3.5, 0B item 9, 0D item 7, X4 and B1 rows, E-14, 5.1 row B | Confirms Y2.2. The plan's own words ("decision by AJ plus a recorded second reviewer where possible", "Dual-control where possible") remain only where they are **quoted** as the plan's wording and are labelled as such: 0B item 9, 0D item 7, B.0, 5.1 row B and E-14. **E-14 stays open** as an unresolved security risk |
| Y2-B | A security investigation qualifies as an authorised case for revoking a suspicious pending ownership offer. Conditions: a genuine security concern; the staff member has explicit authorisation; a recorded reason; captured in the audit trail. Reconcile with X5 and E-28; ordinary support activity or an unsupported suspicion must not become a reason; do not broaden staff authority | 0A (X5, Y2-B rows), 0B item 10, 1.4, 3.1, 3.3, 3.8, 0D item 1, E-22, E-28, E-31 | See the reconciliation table below |
| Y2-C | The system automatically expires an ownership recovery claim after its approved 14-day validity period. A predefined system action, not an ownership decision; the system cannot independently approve a claim, reject an ownership dispute or assign ownership. Preserve the 14 days; invent no renewal process | 0E.1 (Y2.4), 0E.3, 1.4, 3.1 (claim states), 3.2 | The 14-day period is the plan's existing claim rule and is unchanged. The plan's existing rule that an expired claim is replaced by a newly issued claim (Part 1 section 2, "Expired"; 0B item 8) is **not** a renewal and is not changed. **D1 stays open:** if AJ adopts it, a lock would extend frozen items and change when the 14 days end for a locked business; Y2-C does not adopt that |
| Y2-D | Staff viewing of customer business information must be recorded even when no changes are made: staff identity, business accessed, date and time, associated support or recovery case, reason for access. Recording is approved; the complete support access system is not. No permanent or temporary access policy, durations, new workflows or permissions model. Detailed support system deferred | 0E.2, 0E.2a, 0E.3, C.3, E-25, E-32, 5.4 | Integrates with the seven details (0E.2a). Case and reason are listed items, so every view needs a case and a reason, but where the case reference comes from is still undefined (row 8). Whether views through Ops are in scope is not stated (E-30) |

**Y2-B reconciled with X5 and E-28**
| Route for revoking a pending offer | Allowed? | Conditions |
|---|---|---|
| Open recovery case | Yes (X5, proposed) | Authorised staff member; audit record |
| Open dispute case | Yes (X5, proposed) | Authorised staff member; audit record |
| Security investigation | **Yes (AJ's Decision Y2-B)** | All four: a genuine security concern; explicit authorisation of the staff member; a recorded reason; captured in the audit trail |
| Ordinary support activity, a customer's request alone, or an unsupported suspicion | **No** | Not a reason for revocation |

Scope: pending offers only. Y2-B does not let staff start, complete, accept or cancel a transfer (X3, X5), remove an Owner, or act on a transfer that has already been accepted. It does not say who may open a security investigation, what evidence makes a concern "genuine", or whether the investigation has a case record (E-31, row 13).

**Interactions with matters that stay unresolved** (explained, not decided)
| Matter | Interaction with Y2-A to Y2-D |
|---|---|
| Compromised sole Owner (E-04) | Y2-B lets staff revoke a pending offer if an investigation starts **before** the target accepts. After acceptance nothing changes, because O3 stays atomic (A2). Unresolved |
| Co-Owner veto (E-23) | A co-Owner can report a concern to staff; whether it becomes a genuine concern and an investigation is for staff, and the threshold is undefined. No veto. Unresolved |
| Mistyped claim email (E-12) | Unchanged. A mistyped recovery claim also expires after 14 days (Y2-C). Unresolved |
| Staff authority to open cases or apply locks (row 3) | Y2-B requires "explicit authorisation" for revocation; whether it is the same authorisation as for opening a case or locking is not stated. Unresolved |
| Non-recovery claim issuance (row 4) | Y2-C covers expiry of recovery claims only; who issues first-Owner or migrated-customer claims is still not addressed. Unresolved |
| Previous Owner removal or disabling (E-29) | Not touched by any of A to D. Unresolved |
| Unauthenticated actor identity (E-26) | Not touched (staff views are by an authenticated staff member; the system expiry has a system identity). Unresolved |
| Support case reference source (row 8) | Becomes more important: every staff view (Y2-D) and every security-investigation revoke (Y2-B) is recorded against a case. Still undefined |
| Ops as an actor (E-30) | Ops also holds customer business records; whether staff viewing there falls under Y2-D is not stated. Unresolved |
| Audit table design (row 11) | The required record now also includes the five-item staff-view record and the Y2-B conditions. The design is still not decided |

---

## 0. Points where this brief and the approved documents differ (read first)

| # | Point | What the documents say | Why it matters | Needs |
|---|---|---|---|---|
| 0.1 | "One identity belongs to one business" | D15 [Approved]: one membership, in any role, **per product**. One Caterly and one Rivo membership are allowed (Part 3 section 3b). A slot is `UNIQUE (user_id, product_key)`, so two different businesses are possible if they are linked to different products | The brief's wording ("cannot belong to multiple businesses") is stricter than D15 for the case of two products and two businesses. For Caterly only, the two readings are the same | Decision X1: **decided by AJ in revision 3** (section 0A); the brief's stricter wording is superseded for the cross-product case |
| 0.2 | What "cooling-off" means | The only documented cooling-off question is about a **freed slot** after removal: "whether a freed slot has any cooling-off period (proposed: none)" (Part 3 section 3b). There is **no** approved transfer cooling-off. O3 [Approved] makes the new Owner effective in one atomic transaction on acceptance | The brief asks about a transfer cooling-off, which would change O3. AJ has since decided A2 (no transfer cooling-off), so O3 is unchanged; A1, the freed-slot question, is still open | A1 open; A2 **decided by AJ** (no cooling-off), A3 deferred (section 0A) |
| 0.3 | Owners and invitations | Part 3 section 3a: "Owner access never travels by invitation; it uses O2 claims or O3 transfers". But O3 says the owner "invites by email which becomes an invitation as Owner", and Part 1 section 12 says "invite as Owner, accepted by a verified email" | The plan contradicts itself about whether an Owner can be created through an invitation | Decision X2: **decided by AJ** (section 0A); the plan text is not changed |
| 0.4 | Who may start a transfer | Part 3 section 4 [Approved]: only an Owner, with fresh authentication, initiates O3. Part 1 section 2 says an owner transfer may be started by the "current owner or staff with audit". Part 1 section 12: staff cannot change an owner's email outside the dispute procedure | Staff-started transfers are not in the approved permission matrix | Decision X3: **decided by AJ** (section 0A); the plan text is not changed |
| 0.5 | Staff identity | Ops staff sign in separately (F4.2.1: "Ops staff login stays separate"). Nothing in the plan defines how Platform Core knows who staff are, who may approve a recovery, or who counts as "authorised" (the plan's "second reviewer" wording is superseded here by Decision Y2-A) | Every recovery and claim-issue step needs an authenticated, audited staff actor | Decision X4 and gate G5 |
| 0.6 | Fresh authentication | `max_age` enforcement needs session auth time, so it waits for D1 and D2 and F4. W1 tests only the predicate with a supplied timestamp (W1 plan, F3.2.3) | Any "fresh auth" step below is a rule to be tested later, not something enforceable in W1 | Gate G3 |
| 0.7 | Email | Every notification below needs the auth email sender and templates, which are D5 (open) | No notification can be built or tested until D5 | Gate G4 |

---

## 1. Part 1: the agreed architecture and how its parts relate

### 1.1 Rules as agreed (all [Approved] unless marked)

| # | Rule | Source |
|---|---|---|
| R1 | One email is one Platterly identity (a row in `users`) | Part 3 section 3b |
| R2 | An identity has at most one membership, in any role (Owner, Admin, Manager, Member), per product. A second kitchen in a product needs a different email. No switcher, no multi-business list | D15, Gate B-1 record; AJ decision X1 (revision 3) confirms the cross-product reading |
| R3 | A business is an organisation (`biz_<32hex>`). It can have several members, each an individual identity with a central role | Part 3 sections 3 and 4 |
| R4 | A business has at most one link per product (`organisation_products`, primary key `(organisation_id, product_key)`), which is its "account" in that product | W1 plan, F3.2.1 |
| R5 | Several members can use that shared product account, according to their central role and their product role | Part 1 sections 3 and 4 |
| R6 | Central roles are Owner, Admin, Manager, Member (D3). Every Owner-only action needs fresh authentication | D3 |
| R7 | Owner is obtained only by: creating the business (O1), consuming a claim (O2 or O4), or accepting an ownership transfer (O3). Never by role assignment, never by a standard invitation (I1) | Part 3 sections 3, 3a and 4 |
| R8 | A business always has at least one Owner. The last Owner can neither leave nor be removed. Maximum 3 Owners, counting pending owner claims | Part 1 sections 2 and 12 |
| R9 | A central role grants eligibility and a least-privilege default product role, never Caterly's sensitive keys. Caterly's own roles, overrides, Branch, Kitchen and Store stay inside Caterly (D4) | Part 1 section 3, D4 |
| R10 | Caterly login, memberships, kitchen settings and live data are not changed in W1. D15 is enforced in Platform Core only and is not global until the Caterly integration (F8) is separately approved and verified | W1 plan sections 1 and C9 |
| R11 | Email is a one-time proof, never the stored identity or a join key. The claim email stays only in the audit log | Part 3 section 3 |
| R12 | Deleting a business is not available in Account; staff only, manual | Part 3 section 4 |

### 1.2 How the concepts relate

```
Identity (users)                       one per email, global id, not tied to any business
   |  has at most one, per product
   v
Membership (organisation_members)      one row per (organisation, user); central role + status
   |                                    role: owner | admin | manager | member
   |                                    status: active | disabled | removed
   |  one slot per product the organisation is linked to
   v
Slot (membership_product_slots)        UNIQUE (user_id, product_key)  <- the D15 guarantee
   |  exists only while the organisation is linked to that product
   v
Product access                         the product's own Member row and product role
                                        (Caterly: default 'staff'; sensitive keys only inside Caterly)
```

| Concept | What it is | What it is not |
|---|---|---|
| **Ownership** | A central role (`owner`) on a membership, plus the facts that the business exists and `owner_established` is true. It carries authority over the business: members, products, billing, transfers | Not a separate table of people. Not obtainable by promotion or invitation |
| **Organisation membership** | The relation of one identity to one business with a central role and status | Not product access. Not unique per business alone; D15 makes it unique per product through slots |
| **Product access** | The right to use one product's account, via the slot and the product's own member record | Not granted by a central role beyond the default product role. Admin has none until a Caterly role is assigned |
| **Employee role** | Admin, Manager or Member in the central model; a separate product role inside the product | Owner is not an "employee role": it is only reachable by the owner flows |

Ownership and employee access are therefore separate in how they are **obtained** (owner flows versus invitations and role assignment), while an Owner is also a member (a membership row with role `owner`) so the slot rule applies to Owners too.

### 1.3 What changes the owner set

| Event | Flow | Uses |
|---|---|---|
| New business by a verified user | O1 | `createOrganisation`; Owner + slot + product link in one transaction |
| Existing business with no owner, or a further legitimate owner | O2 claim | Staff-issued, email-bound, 14 days, consume needs secret and verified matching email |
| An Owner adds or hands over to another person | O3 transfer | Two-party, fresh auth, cap 3, 7 days |
| A migrated customer | O4 | Organisation created with no membership; one O2 claim per AJ-confirmed owner. Blocked on E2 |
| An owner steps down | role change to Admin | Allowed unless last Owner |
| No owner can act | Recovery / dispute (Part 1 section 12) | Staff-only, `ownership_locked`, evidence, 7-day notice |

### 1.4 Who may act on ownership: customers, staff and the system (AJ's Y2 decisions)

| Actor | May | May not |
|---|---|---|
| Customer (an identity with a membership) | Everything the permission matrix allows its role, including the owner flows O1 to O3 for an Owner | Obtain Owner authority except through O1, O2 or O3 |
| Authorised Platterly staff | Lock access when there is a credible security concern; investigate ownership and access problems; revoke suspicious pending ownership offers, only through an authorised recovery, dispute or security-investigation case with the four conditions in 0E.5 (Decision Y2-B); issue a new ownership recovery claim after the verification process; have limited access to relevant business information when handling support or recovery matters (details deferred; every view is audited, Decision Y2-D) | Directly assign or transfer business ownership; start an O3 transfer (X3); become a member or employee of the customer's business; hold Owner-level authority. Ordinary support staff do not automatically receive the recovery permissions |
| System (automated Platterly processes) | Execute predefined, approved actions: expire offers after seven days; expire recovery claims after their approved 14-day validity (Decision Y2-C); expire invitations by their approved rules; record audit events; enforce approved access restrictions; execute routine account processes | Make discretionary ownership decisions; resolve ownership disputes; assign business ownership |

Staff hold no membership and therefore no slot (D15). Every relevant action records the seven audit details, with the initiator and the executor recorded separately, and every staff view of customer business information is recorded (0E, 0E.2a).

---

## 2. Part 2: the three open questions

Every item below is a **proposal** until AJ decides, except where it is marked **[AJ decision]** (X2, X3, A2 and A3, section 0A), which AJ has given for review. "Recommended" means my recommendation, not a decision.

### 2.A Cooling-off period

**A.0 Current documented position**
| Item | Position |
|---|---|
| Freed slot | Open question. Proposed in the plan: no cooling-off. Freed slots are usable at once (Part 3 section 3b; W1 plan C8: a disabled member keeps the slot, only removal frees it) |
| Transfers (O3) | No cooling-off. Acceptance is atomic: one transaction adds Owner (cap 3); the initiator then stays Owner, steps down to Admin, or is removed. Transfer expires in 7 days; one pending transfer per business; blocked while `ownership_locked` |
| Holds that do exist | 72 h email-change hold: ownership transfers, claim consumption and billing-contact change are held; pending claims and invitations to the old address are revoked (Part 1 section 12). 7-day notice to all current owner emails during a dispute |
| Cancellation | A pending claim can be revoked or superseded by staff. A pending transfer: only "expires in 7 days; abandoned and cancelled" appear as test names; who may cancel is not written down |

**A.1 Freed-slot cooling-off (the documented question)**
| Item | Content |
|---|---|
| Proposed rule [Proposed] | No cooling-off. A slot freed by removal, leaving, or unlinking is usable at once, in the same transaction |
| Alternatives | (a) 24 to 72 h hold on the freed slot for that identity and product; (b) hold only when the removal was a staff action or an ownership recovery |
| Consequences | No hold: no extra column or timer, simplest to test, matches C8. A hold would need a new `released_at` or hold row, would block a legitimate quick re-hire, and would give a removed employee (or an attacker holding a removed identity) nothing extra to exploit or be protected from. Abuse risk without a hold: a person can be removed from business A and added to business B of the same product immediately; D15 only forbids being in both at once, so this is allowed by design |
| Recommended | No cooling-off for freed slots |
| AJ decides | Decision A1 |

**A.2 Transfer / new-owner cooling-off: AJ decision, recorded for review (revision 2)**
| Item | Content |
|---|---|
| AJ decision [AJ decision] | No additional cooling-off period. Retain the existing atomic O3 transfer on acceptance. The proposed 72-hour holding state and activation job are not introduced |
| What stays exactly as approved | O3 in Part 3 section 3: the target accepts while signed in with a verified email; one transaction adds Owner (cap 3) and applies the initiator's choice (stay Owner, step down to Admin, or be removed); the offer expires in 7 days; one pending transfer per business; blocked while `ownership_locked`; start and acceptance take `lockOrganisation` and re-check the cap (CL-7 and CL-8). W1 plan: a transfer at a full cap adds the target and steps down or removes the initiator in one transaction, and the service counts the final state |
| What stays as a separate rule | The 72 h email-change hold (Part 1 section 12): while it runs, ownership transfers, claim consumption and billing-contact change are held. It is not a transfer cooling-off and nothing is stacked on it |
| When does the new Owner get authority? | At acceptance, in the same transaction, after the checks run under the lock (not locked, cap on the final state, target verified and not disabled, target's slot free, no email-change hold) |
| Can an offered transfer be cancelled? | The plan lists "abandoned" and "cancelled" among the O3 tests but does not say who may cancel an offer. Open: Decision X5 |
| If someone disputes it | Before acceptance, a dispute sets `ownership_locked` and the offer cannot be accepted (the documented block). After acceptance there is no waiting period: the routes are the dispute procedure and a recovery case (workflows 4 and 5) |

Options considered and not adopted: a 72 h hold for every new Owner; a hold only for a full handover; a hold only for a new or recently changed target. Their design (a `holding` state, an effective-at time, an activation job, cancel-during-hold) is not part of this draft.

**Consequences of the decision**
| Consequence | Detail |
|---|---|
| Simplicity | No new state, timer or job. `F5.3.1` keeps one atomic transaction and CL-7 and CL-8 apply unchanged |
| **Unresolved security risk (E-04)** | **An immediate O3 transfer can succeed as soon as the target accepts, even if the sole Owner's email is compromised.** Nothing in this draft prevents it. A3 is deferred, so no independent channel exists, and no waiting period gives anyone time to react |
| Controls that exist and why they do not address it | **Email notices** (to Owners, the target or the initiator) go to the same compromised inbox when there is one Owner, so they are **not** a mitigation; they are informational only. **Fresh authentication** does not stop an attacker who controls the inbox if sign-in or recovery is email-based (the design is `F4.1.2`, not decided), so it is not relied on. The **72 h email-change hold** only delays transfers after an email change; it does not stop an attacker who already controls the existing inbox. The target's verified email and free slot are checks on the **target**, not on the initiator. **Staff lock, user-level revocation and recovery** act only after someone detects the problem |
| What a co-Owner can do (X5) | Other Owners cannot cancel an offer. They can only ask staff to open a dispute, which sets `ownership_locked` and blocks acceptance. That depends on a person noticing and contacting staff in time; no automatic path exists |
| After acceptance | The new Owner cannot be removed from the UI (Owner removal is dispute-only), so the remedy is a dispute or recovery case |

**A.3 Sole-Owner notification: AJ decision, deferred (revision 2)**
| Item | Content |
|---|---|
| AJ decision [AJ decision] | Defer the independent out-of-band notification mechanism. Leave it unresolved for later design. Do not introduce a new recovery-contact field. Do not assume the Ops billing contact is suitable |
| What this means here | No new field and no second channel are specified. Notices (the 7-day dispute notice, the email-change cancel link, transfer and recovery notices) keep going to the current Owners' own verified addresses |
| What is not claimed | This draft does **not** claim that email notifications mitigate the compromised sole-Owner scenario. They do not (see the table above) |
| Risk kept open | The compromised sole-Owner scenario (E-04) stays an unresolved security risk. It is not mitigated by this draft |
| When it is revisited | Not set by AJ. A suggestion only: together with the account-recovery design (`F4.1.2`) and `F5.1.1` |

**Recommended approach.** A1 stays open (recommended: no freed-slot cooling-off). A2 is decided (no cooling-off). A3 is deferred. X5 is AJ's proposed decision (section 3.8).

**AJ decides (still open here):** A1 (freed slot). A2 is decided, A3 is deferred and X5 awaits AJ's confirmation.

### 2.B Lock-out recovery

**B.0 Current documented position**
| Item | Position |
|---|---|
| Procedure [Documented] | Staff-only. Lock ownership changes (`ownership_locked`). Evidence checklist: GST certificate, registration, registered phone and email verification, call. 7-day notice to all current owner emails. Decision by AJ plus a recorded second reviewer where possible (the plan's wording; superseded in this draft by AJ's Decisions Y2.2 and Y2-A: one authorised staff member is sufficient). Then a new claim to a verified email. All steps audited. Billing and data untouched (Part 1 section 12) |
| Open question | "How staff recover an owner who locked themselves out by choosing the wrong email (proposed: the dispute procedure)" |
| Related | Dispute tooling is `F5.3.2` (`ownership_locked`, evidence record, 7-day notices). Recovery operations are `F5.1.2` (re-issue, revoke, fix wrong email, notifications). Wrong contact email on a claim: staff revokes and re-issues with a reason (Part 1 section 2). Owner removal is only by the dispute procedure |
| Not documented | Who exactly may approve; what evidence is required for which situation; what happens to the old owner's membership; what the original owner can do afterwards; what staff identity means in Platform Core |

**B.1 Situations (so the right route is used) [Proposed]**
| # | Situation | Route |
|---|---|---|
| S1 | Another Owner exists and can act | No staff needed: that Owner uses O3 to add a new owner for the person, or removes nothing. Staff are not involved |
| S2 | Sole Owner forgot the password or lost the second factor, still owns the email | Account recovery in `F4.1.2`. Not an ownership matter |
| S3 | Sole Owner lost control of the email address (closed, expired, lost) | Ownership recovery case (below) |
| S4 | Sole Owner "chose the wrong email" at sign-up or claim (for example a throwaway) | Same case. Evidence is the same; the old identity may hold nothing else of value |
| S5 | Sole Owner's identity is suspected compromised | Lock first (immediate, by staff), user-level revocation (Part 1 section 11), then the same case |
| S6 | Owner unreachable or deceased, others claim | Recovery case with extra evidence (relationship to the business); never decided on one claimant's word. If it becomes contested it is a dispute (workflow 4) |

**B.2 Proposed recovery case [Proposed]**
| Step | Rule |
|---|---|
| 1. Open | Staff opens a case with a reason and the applicant's name. This sets `ownership_locked` at once. Members and normal operation are not affected; only ownership changes, claims, transfers and billing-contact changes are blocked |
| 2. Verify the applicant | Evidence checklist, all recorded: (a) a business document in the business's name (GST certificate or registration); (b) government photo ID of the applicant that matches a proprietor, partner or director on that document; (c) a call-back to the **registered** phone number held on file (never to a number the applicant supplies now); (d) control of the proposed new email, proved by sign-in with a verified address; (e) for migrated customers, the source record from the old system; (f) a short written account of how access was lost |
| 3. Check the business | Staff confirm the members list and that the applicant is not an employee. An employee is not eligible unless they can also meet (a) to (e) as a proprietor, partner or director |
| 4. Notice | A 7-day notice [Documented] goes to **every current Owner email** and, as a proposal, a lock notice (no names, no evidence) goes to every Admin. It carries an "I object" action (see B.4). Notice is sent even if the current Owner's email is suspected lost, because a lost mailbox may still be read by the real owner |
| 5. Decide | **One authorised Platterly staff member is sufficient** to investigate and approve the recovery action (AJ decision Y2.2). A second staff member's approval is **not** mandatory, and no second review is required or implied (Decision Y2-A, revision 5). Recovery permissions are restricted to explicitly authorised staff; ordinary support staff do not receive them automatically. The approval is recorded with the seven audit details (0E.2). The applicant cannot approve their own case [Proposed, unchanged]. Part 1 section 12 says "decision by AJ plus a recorded second reviewer where possible" (0B item 9) |
| 6. Issue | On approval an authorised staff member issues a new O2 recovery claim to the verified new email (AJ decision Y2.1). **Staff never directly assign or transfer ownership**: the new Owner must consume the claim themselves. The normal claim rules apply: 14 days, secret plus verified email, cap 3, D15 slot check at issue and at consume. Initiated by the staff member, executed by the system, recorded separately (0E.3) |
| 7. Close | After consumption, staff close the case. `ownership_locked` is cleared only by staff, with audit |

**B.3 What happens to the previous Owner's membership (Decision B2)**
| Option | Effect | Recommended? |
|---|---|---|
| (a) Previous Owner stays Owner | Cap permitting. Right for a genuine "lost email, same person" case, wrong for compromise | Only for S3 and S4 when the old identity is shown to be the applicant's |
| (b) Role changed to Admin, membership stays active | Keeps access without ownership. Dangerous in a compromise (S5) | No |
| (c) Membership set to `disabled`, Owner role removed, slot kept (C8) until reinstated through staff | Safe default. The old identity cannot act. It still holds its slot, so it cannot join a second Caterly business while the matter is open | **Recommended default** |
| (d) Membership `removed`, slot freed | Cleanest for S5 or when the old owner is confirmed gone. Irreversible without a new flow | Recommended for confirmed compromise or abandonment, by AJ's decision |

**Ordering constraint from the W1 plan (clarification B).** The owner floor counts **active** Owners only and a deferred trigger enforces it, so the last active Owner of an established organisation cannot be disabled or removed until a replacement Owner is active. The cap counts **non-removed** (active or disabled) Owners, so a disabled previous Owner still uses one of the 3 places until removed. A recovery therefore consumes the new claim first and changes the old membership second (options c and d); option (c) cannot be applied to a sole Owner before the replacement exists.

**B.4 If the original Owner regains access [Proposed]**
| When | What happens |
|---|---|
| During the 7-day notice | The "I object" action is available to any current Owner with a verified session. It moves the case to **disputed**: no claim can be issued, the lock stays, staff review. Nothing is decided automatically. Staff contact the objector through the registered phone |
| After the claim is consumed, old membership `disabled` (option c) | The original Owner can sign in but has no access to that business. They ask support to reinstate. Staff repeat the evidence check; the new Owner(s) are told; reinstatement as Owner uses a normal O2 claim (cap permitting) or ends in a dispute. No self-service reinstatement |
| After removal (option d) | Same: a new claim, never automatic |
| Both parties claim ownership | Dispute (workflow 4). The business stays locked, billing and data untouched, until AJ rules |

**B.5 Preventing an employee or stranger from claiming ownership**
| Control | Source |
|---|---|
| Claims are issued only by staff, bound to one email, with a one-time secret; consume needs the secret **and** a verified matching email | [Approved] Part 3 section 3 |
| Admin cannot touch Admin or Owner; Owner removal is dispute-only; an employee cannot self-promote | [Approved] Part 3 section 4 |
| Evidence must show control of the business, not of the workplace; an employee holding a work mailbox is not enough | [Proposed] step 3 |
| 7-day notice to all current owners and a lock notice to Admins, so a fraudulent case is visible to people who know the business | [Documented] and [Proposed] |
| One authorised staff member decides; a second approval is not mandatory (AJ decisions Y2.2 and Y2-A). Recovery permissions are restricted to explicitly authorised staff and are not granted automatically to ordinary support staff. Every step is audited with the seven details (0E.2) | [AJ decision Y2.2]. Replaces the earlier "two-person rule" proposal, which AJ's decision does not adopt; the plan's own "AJ plus a second reviewer where possible" is unchanged (0B item 9) |
| Rate limits on case opening and claim issuing; every step audited | [Documented] |

**Operational consequences.** A case takes at least 7 days. Staff time is real (document review, call-back). A backlog or a single reviewer is the practical limit. Until staff identity exists in Platform Core (decision X4), the procedure can only be written down, not tooled.

**Alternatives to the 7-day notice:** 72 h (matches the email hold; faster but less time to object). A second out-of-band contact is not available: AJ deferred that design (A3), so the notice goes only to the current Owners' addresses and, if adopted (B4), to Admins. **Recommended:** keep the documented 7 days.

**AJ decides:** B1 (who may **open** a case or set the lock; approval authority is settled by Y2.2: one authorised staff member), B2 (previous Owner's membership: c as default, d for confirmed compromise), B3 (evidence list and minimum for each situation), B4 (whether Admins receive the lock notice), B5 (how long a case may stay open).

### 2.C Refusal message

**C.0 Current documented position**
| Item | Position |
|---|---|
| Open question | "What message the invitee sees when refused" (Part 3 section 3b) |
| Documented messages | O1 refused: "this email already has a Caterly kitchen". Invitation refused at send: say so to the inviter "without revealing whose". Linking refused for a member who holds a slot elsewhere: report to staff with a **count only**, "never the other business's identity". Claim issue refused: tell staff to use a different email. Cap or lock timeouts: "limit reached", not a server error. Authentication messages are enumeration-safe (F4.1.1) |
| Logging | Audit log exists; no secrets logged; redaction test fails on keys matching secret, token, password, otp or hash. The claim email stays only in the audit log |

**C.1 When to refuse [Proposed catalogue; the cause for each is already a documented rule]**
| Code | Cause | Flows |
|---|---|---|
| `SLOT_TAKEN_SELF` | The acting user already has a slot for this product | O1 |
| `SLOT_TAKEN_TARGET` | The person named already has a slot for this product | O2 issue and consume, O3 start and acceptance, I1 and I2 send and accept, link product |
| `OWNER_CAP` | Owners plus pending claims would exceed 3; a transfer is checked at acceptance, on the final state | O2, O3 |
| `CLAIM_UNAVAILABLE` | Claim expired, revoked, superseded, already consumed, wrong secret, or email does not match | O2 consume |
| `UNVERIFIED_EMAIL` | The acting identity has no verified email | O1, O2, O3 |
| `OWNERSHIP_LOCKED` | Business is locked by a dispute or recovery | O2, O3 |
| `HOLD_ACTIVE` | The 72 h email-change hold is running | O2 consume, O3 |
| `FRESH_AUTH_REQUIRED` | Owner-only action without recent authentication | O3, step-down, owner add |
| `NOT_PERMITTED` | Caller's role does not allow the action | all |
| `TRANSFER_PENDING` | A transfer is already pending for the business | O3 start |
| `RATE_LIMITED` | Too many issue, consume or case attempts | all |
| `LAST_OWNER` | The action would leave the business with no Owner | step-down, remove |
| `CONFLICT_RETRY` | Lock timeout or unique violation on a race | all |

**C.2 What the actor sees [Proposed]**
Principle: reveal only what the actor already knows or is entitled to; never reveal that another business, another account holder or another owner exists; give a support route; never give a different answer that lets someone probe.

| Code | Actor sees | Does not see |
|---|---|---|
| `SLOT_TAKEN_SELF` | "This email already has a Caterly kitchen. A second kitchen needs a different email address." (documented wording; the user's own fact) | Which business |
| `SLOT_TAKEN_TARGET` | To a staff issuer: "This address already has a Caterly account; use a different address." To an inviter or an Owner: "This person cannot be added with this email address." To the invitee or target: "This invitation can't be accepted with this account. Contact support with reference `<case id>`." | Whose business, what role, whether the person exists |
| `OWNER_CAP` | "This business already has the maximum number of owners or pending owners." (the actor is an Owner or staff, so the fact is theirs) | Names of pending claimants |
| `CLAIM_UNAVAILABLE` | One message for all claim failures: "This link can't be used. Ask for a new one." | Which of expired, used, revoked, wrong email, wrong secret |
| `UNVERIFIED_EMAIL` | "Verify your email address first." | |
| `OWNERSHIP_LOCKED` | "Ownership changes are paused for this business. Contact support." to Owners; to anyone else the generic `NOT_PERMITTED` text | Why it is locked, who opened the case |
| `HOLD_ACTIVE` | "This change is on hold until `<date>` for security." to Owners | The reason for the hold beyond "security" |
| `FRESH_AUTH_REQUIRED` | "Sign in again to confirm this change." | |
| `NOT_PERMITTED` | "You don't have permission to do this." | Whether the target exists |
| `RATE_LIMITED` | "Too many attempts. Try again later." | |
| `LAST_OWNER` | "A business must have at least one owner." | |
| `CONFLICT_RETRY` | "Limit reached or the business changed at the same moment. Try again." (documented: never a server error) | |

**Support route.** Every refusal that is not a plain correctable input shows "Contact Platterly support" plus a random **reference id** that staff can look up. The reference id is not derived from any business, user or email.

**C.3 What staff and the audit see [Proposed]**
| Item | Rule |
|---|---|
| Event | One `ownership.refused` audit row per refusal (the audit completeness test in `F3.3.1` already requires exactly one audit row per state change; whether a refusal that changes no state is audited is Decision C2) |
| Fields | The seven mandatory audit details (0E.2, AJ decision Y2.5): actor category; exact actor or system-process identity; action performed; affected business; date and time; reason or associated support or recovery case; approval details. Plus, for a refusal, the reason code, the flow, the target identifier as the plan allows (the claim email stays in the audit log only) and the reference id. The initiator and the executor are recorded separately (Y2.6). A staff view of customer business information is recorded the same way (Y2-D, 0E.2a). Never the secret, token, OTP or hash |
| Other business | For `SLOT_TAKEN_TARGET`, whether the audit may store the **other** organisation id for staff investigation. Visible to staff only, never to any end user. Decision C3 |
| Aggregation | Repeated refusals for one actor or one business raise a staff alert (rate-limit data); no automatic lock |
| Retention | Not decided; follows the audit retention policy, which the plan does not state |

**Security and operational consequences.** The single claim-failure message costs some user clarity and saves enumeration. A support reference id adds a staff lookup tool. Text for these messages needs D5 (sender and templates) for email versions and the design-system rule check for on-screen versions.

**Recommended approach.** Adopt the catalogue and the principle; one generic message for claim failures; reference id on every support route; audit every refusal; keep the other business's id out of every end-user message.

**AJ decides:** C1 (accept the principle and wording style), C2 (audit refusals that change nothing), C3 (store the other organisation id in the audit row), C4 (exact wording is reviewed at build time).

---

## 3. Part 3: end-to-end workflows

Common to all: every state change takes the shared `lockOrganisation` (one organisation per transaction), writes exactly one audit row per change, writes events through the outbox in the same transaction, and uses `lower(email)`. Every relevant action records the seven audit details and the initiator and executor separately (0E). Email notifications wait for D5. Staff steps need an authorised staff member (Y2.2); how staff are identified is not decided (X4).

### 3.1 State models

**Claim (O2/O4) [Documented]:** `pending` to `consumed`, `expired` (14 days), `revoked`, `superseded`. A pending claim holds a `pending_slot` 1 to 3. The transition to `expired` is made by the system when the 14-day validity ends. It is a predefined system action, not an ownership decision: the system cannot approve a claim, reject a dispute or assign ownership, and no renewal process exists (AJ's Decision Y2-C, which names recovery claims; row 15 of 0E.4).

**Transfer / owner addition (O3) [Documented; state names are working labels, see 0C]**
```
offered ──accept, checks pass──> completed     (one transaction; authority at acceptance)
   │  │            └─ checks fail ──> refused
   │  ├─ decline (target) ──> declined
   │  ├─ cancel (initiating Owner only) ──> cancelled                       [AJ's proposed decision X5]
   │  ├─ revoke (staff, only through a recovery, dispute or security-investigation case,
   │  │          with an audit record) ──> revoked                           [AJ's proposed decision X5]
   │  └─ ownership lock set ──> acceptance blocked (documented); the offer stays until revoked or expired (D1 open)
   └─ 7 days ──> expired
```
There is no holding state and no delayed activation (AJ decision A2). Other Owners cannot cancel an offer (X5).

**Recovery case [Proposed; tooling is F5.3.2]**
```
opened(lock set) ──evidence──> in_review ──notice sent──> noticed ──7 days, no objection──> decided
                                                              │                              │
                                                              └─ objection ──> disputed     ├ approved ──> claim_issued ──> closed
                                                                                               └ rejected ──> closed (lock cleared)
disputed ──AJ rules──> approved / rejected / withdrawn
```

### 3.2 Workflow 1: initial ownership claim (O2; O4 is the same for migrated customers)
| Item | Content |
|---|---|
| Actors | Staff (issuer), claimant (a verified user), the system |
| Preconditions | Business exists (Ops-provisioned or imported) and has `owner_established = false` or a further legitimate owner is wanted; Owners plus pending claims below 3; the bound email has no slot for any product the business is linked to |
| Steps | 1. Staff issue a claim bound to an email under the organisation lock (expired claims marked first; same-email pending claim superseded; free `pending_slot` chosen). 2. A one-time secret is sent to that address. 3. The claimant signs in with that verified email and opens the link. 4. One transaction: `UPDATE ... WHERE status='pending'`, create or reactivate the Owner membership for the claimant's **user id**, insert slots for every linked product, bump `membership_version`, set `owner_established`, record `legacy_user_id` for O4 |
| State transitions | Claim `pending` to `consumed`; membership `owner`/`active`; organisation `owner_established` true |
| Permissions | Issue: an authorised staff member for recovery claims (Y2.1, Y2.2); who issues the first-Owner or migrated-customer claims (O2, O4) is not addressed by Y2 (0E.4 row 4). Consume: the matching verified user only. Nobody can claim by role |
| Initiator and executor | Claim issued: initiated by an authorised staff member, executed by the system. Claim consumed: initiated by the claimant, executed by the system. Claim expired: the system, under the predefined 14-day rule (0E.3; Decision Y2-C: not an ownership decision) |
| Notifications | Claimant: claim email (secret). Existing Owners, if any: a notice that a claim was issued [Proposed]. Staff: consumption confirmation |
| Audit | `ownership.claim.issued`, `.superseded`, `.revoked`, `.expired`, `.consumed`, `ownership.refused` |
| Events | `membership.changed`, `owner.changed` (billing contact updates in Ops) |
| Refusals | `SLOT_TAKEN_TARGET`, `OWNER_CAP`, `CLAIM_UNAVAILABLE`, `UNVERIFIED_EMAIL`, `OWNERSHIP_LOCKED`, `HOLD_ACTIVE`, `RATE_LIMITED`, `CONFLICT_RETRY` |
| Tests | Plan list: competing, replay, expired, wrong email, wrong secret, double submit, reissue creates no duplicate; two legitimate owners independently; duplicate email supersedes; fourth refused; simultaneous issue cannot exceed limit; slot taken at consume |

### 3.3 Workflow 2: transfer started by the existing Owner (O3)
| Item | Content |
|---|---|
| Actors | Initiating Owner (fresh auth), target (an existing identity, or a person without an account reached by an ownership offer, see X2), system. **Only an Owner may initiate** (AJ decision X3); staff may not |
| Preconditions | Initiator is an active Owner; business not `ownership_locked`; no pending transfer; no email-change hold; target holds no slot for the product (or is already a member of this business); the Owner count after the transfer is 3 or fewer, so at a full cap the initiator steps down or is removed in the same transaction (W1 plan). A pending transfer is not counted against the cap until acceptance |
| Steps | 1. Initiator names the target and chooses what happens to their own role: stay Owner, step down to Admin, or be removed. 2. Start takes the organisation lock, re-checks everything and writes the pending transfer (7-day expiry). For a person without an account the offer is a separate ownership offer, never a standard invitation (AJ decision X2); its mechanics are undecided (0C). 3. Target is notified. 4. Target signs in with a verified email and accepts. 5. One transaction under the lock: re-check not locked, cap on the final state, target verified and not disabled, target's slot free, no email-change hold; add Owner; apply the initiator's choice; bump `membership_version`; insert slots; write events. **Authority passes at acceptance** (AJ decision A2) |
| State transitions | `offered` to `completed`, `declined`, `cancelled`, `revoked`, `expired` or `refused` (working labels) |
| Permissions | Start: Owner with fresh auth. Cancel: the initiating Owner only (X5; fresh auth is Y6). Decline: the target. Accept: the target. Other Owners, Admin, Manager and Member: cannot start or cancel. Staff: cannot start; may revoke a suspicious pending offer only through an authorised recovery, dispute or security-investigation case (X5, Decision Y2-B) |
| Notifications | Target: the offer and a reminder before the 7-day expiry. All Owners: started, completed, declined, cancelled, revoked, expired [Proposed]. Initiator: the result. All wait for D5. **Notices are informational. They are not a security control** (see E-04) |
| Audit | `ownership.transfer.started`, `.completed`, `.declined`, `.cancelled`, `.revoked` (with the case reference), `.expired`, `ownership.refused` (names are proposals) |
| Events | `owner.changed` and `membership.changed` at completion |
| Refusals | `SLOT_TAKEN_TARGET`, `OWNER_CAP`, `TRANSFER_PENDING`, `OWNERSHIP_LOCKED`, `HOLD_ACTIVE` (the email-change hold), `FRESH_AUTH_REQUIRED`, `LAST_OWNER`, `NOT_PERMITTED` (a non-Owner, another Owner trying to cancel, or staff trying to start) |
| Tests | Plan list: cap, abandoned, cancelled, locked, concurrent transfers, last owner leaving, transfer racing claim issue and consume (CL-7, CL-8), transfer at a full cap in one transaction. Added: a non-Owner and a staff member cannot start a transfer; accepting a standard invitation can never produce an Owner; another Owner cannot cancel; the initiator can cancel before acceptance and not after; the target can decline; staff revoke only inside a case and the audit row carries the case reference |

### 3.4 Workflow 3: transfer when the existing Owner is unavailable
There is no separate flow: O3 needs the Owner. The cases route as follows.
| Situation | Route |
|---|---|
| A second Owner exists | That Owner runs workflow 2 (S1). No staff |
| Sole Owner unreachable (lost email, lost access) | Workflow 5 (recovery after lock-out) |
| Sole Owner deceased or gone | Workflow 5 with the S6 evidence; never a transfer |
| Staff-started transfer on the Owner's behalf | **Decided by AJ (X3): staff never start an O3 transfer.** They use a recovery case and an O2 claim. Part 1 section 2 of the plan still says "current owner or staff with audit" and conflicts with this decision until AJ approves an amendment (0B, item 3; proposed wording in 0D, item 3). This draft does not change the plan |

### 3.5 Workflow 4: ownership dispute
| Item | Content |
|---|---|
| Triggers | Two claimants; an Owner objects to a case or a transfer; a staff finding of fraud or compromise; a party contacts support |
| Actors | Staff (open, collect evidence), an authorised staff member (decides, Y2.2), the parties |
| Preconditions | None; any trigger may open one |
| Steps | 1. Staff set `ownership_locked` (immediate). 2. Pending claims and transfers are frozen (a frozen item is neither consumed nor expired silently: its expiry is extended by the lock length, Decision D1). 3. Evidence collected from each party (workflow 5 checklist). 4. 7-day notice to all current Owner emails [Documented]. 5. One authorised staff member decides (AJ decision Y2.2); a second approval is not mandatory. 6. Outcome: claim issued to the confirmed party; or no change; or Owner removal (dispute-only per Part 3 section 4); lock cleared by staff |
| State transitions | Case `opened` to `disputed` to `approved`/`rejected`/`withdrawn` to `closed` |
| Permissions | Staff only; no party can decide their own case |
| Notifications | All current Owners and (proposed) Admins: lock notice; parties: outcome |
| Audit | `ownership.lock.set`, `.cleared`, `ownership.recovery.evidence_recorded`, `.notice_sent`, `.objection_raised`, `.approved`, `.rejected`, `.closed` |
| Unchanged | Billing and data untouched [Documented]; members keep working |
| Tests | Lock blocks claims, transfers (including acceptance) and billing-contact change; lock does not block members or product use |

### 3.6 Workflow 5: ownership recovery after lock-out
This is the case in section 2.B.2, with the situation codes S3 to S6. Its end result is an O2 claim to a verified new email, and the previous Owner's membership is handled by Decision B2.

### 3.7 Workflow 6: claim or transfer refusal
| Item | Content |
|---|---|
| Trigger | Any flow check fails (catalogue in 2.C.1) |
| Steps | 1. The transaction rolls back or the pending item is moved to `refused` where the item persists (a transfer refused at acceptance). 2. A reference id is generated. 3. The actor sees the 2.C.2 text. 4. One audit row (subject to C2). 5. Notifications go only to parties entitled to know (for a transfer refused at acceptance: the initiator and all Owners, not the target's other-business facts) |
| Never | A server error for a business rule; an answer that reveals another business or account |

### 3.8 Workflow 7: cancelling an offered transfer (there is no cooling-off period)
AJ decided that there is no cooling-off period (A2), so there is no holding state to cancel in. What remains is ending an **offered** transfer before it is accepted. The rules below are **AJ's proposed decision X5, for review**.
| Item | Content |
|---|---|
| Who may end it | The **initiating Owner** cancels. The **target** declines. **Other Owners cannot independently cancel.** **Staff** may revoke only through an authorised recovery, dispute or security-investigation case, with an audit record (Decision Y2-B conditions: 0E.5) |
| Fresh authentication | Not decided (Y6). D3 says every Owner-only action needs it; the matrix has no cancel row yet (0B item 6) |
| Steps (cancel) | 1. The request takes the organisation lock. 2. The offer moves from `offered` to `cancelled`. 3. The target and all Owners are notified (informational). The one-pending-transfer slot is free again |
| Steps (decline) | The target answers the offer; it moves to `declined`; the initiating Owner and all Owners are notified |
| Steps (staff revoke) | Inside an open recovery, dispute or security-investigation case, an authorised staff actor revokes the pending offer; it moves to `revoked`; the audit row carries the recorded reason, the case reference where one exists and the actor; the initiating Owner and the target are notified. A security investigation qualifies only on the four conditions in 0E.5 (genuine security concern, explicit authorisation, recorded reason, audit trail); ordinary support activity or an unsupported suspicion is not a reason. Initiated by the staff member, executed by the system. Staff identity is undecided (X4) |
| After acceptance | The transfer is `completed` and cannot be cancelled. The routes are the dispute procedure and a recovery case |
| Open points | If the initiator stops being an Owner while the offer is pending (E-18), only the target, expiry or staff can end it. Whether an ownership lock freezes or extends a pending offer is D1. Because other Owners have no veto, a co-Owner who did not authorise an offer can only ask staff to open a dispute (E-23). Decision Y2-B settles that a security investigation qualifies as an authorised case for revoking a suspicious pending offer, on four conditions (0E.5); what makes a concern "genuine" is not defined (E-31). A staff revocation is initiated by the staff member and executed by the system (0E.3) |
| Audit | `ownership.transfer.cancelled`, `.declined`, `.revoked` |
| Tests | Cancel racing accept (exactly one wins); cancel by another Owner refused; decline by a non-target refused; staff revoke outside a case refused; revoke writes the case reference |

---

## 4. Part 4: security and edge-case register

Status key: **C** covered by an [Approved] or [Documented] rule; **P** covered by a rule proposed in this draft; **U** unresolved (no behaviour invented).

| ID | Case | Existing rule | Proposed handling | Status |
|---|---|---|---|---|
| E-01 | Duplicate ownership claims | One pending claim per `(businessId, boundEmail)`; same-email reissue supersedes; 3 pending max; slot constraint backstops the lock | None needed | C |
| E-02 | Concurrent transfer requests | One pending transfer per business; shared `lockOrganisation`; 3-Owner cap re-checked under the lock; CL-7 and CL-8 | A pending transfer is not counted against the cap until acceptance, where the final state is checked under the lock (AJ decision A2: no hold) | C |
| E-03 | Former employee attempts ownership recovery | Removed members hold no slot and no role; claims are staff-issued and email-bound; Owner removal is dispute-only | Recovery evidence must show proprietor/partner/director status, not past employment; an ex-employee with a work mailbox is refused at step 3 | P |
| E-04 | Owner account compromised | User-level revocation and back-channel logout for suspected compromise (Part 1 section 11); `ownership_locked`; 72 h email-change hold; fresh auth for Owner actions | Staff lock first, then recovery. **No hold exists (AJ decision A2) and the out-of-band notice is deferred (AJ decision A3), so an immediate O3 transfer can succeed after the target accepts even if the sole Owner's email is compromised.** Email notices go to the same compromised inbox and are **not** a mitigation. Nothing in this draft resolves it | **U (retained by AJ's decisions)** |
| E-05 | Business already linked to a product | An O2 consume inserts slots for every linked product in the same transaction; a taken slot refuses the whole consume; linking a product refuses if any member already holds a slot elsewhere (count only) | Same; refusal text from 2.C.2 | C |
| E-06 | Multiple employees claim ownership | Employees cannot create claims; staff issue claims; independent claims for different emails are each consumed by their own holder; cap 3; more than 3 candidates: AJ chooses 3, the rest become Admin (O4 text) | Contested claims go to workflow 4 | C, P |
| E-07 | Employee leaves | Removal frees the slot in one transaction; sessions lose access on the next request; the last Owner cannot leave; an Owner steps down first | A leaver with a pending transfer: see E-18 | C |
| E-08 | Owner loses access to the email | Email change needs fresh auth and a code to the new address; staff cannot change an owner's email outside the dispute procedure | Workflow 5, situations S3 and S4 | P |
| E-09 | Existing Caterly business ownership conflicts | The audited gap: Ops `business.provision` creates an organisation with no user and the owner's later sign-up creates a second one; self-heal creates organisations; D15 is not enforced in live Caterly; the Caterly integration (F8) is a final, separately approved activity | Platform Core does not change Caterly in W1. O4 handles the 3 migrating customers (needs E2). Conflicts found at migration are reported and stop for AJ (M-03); nothing is merged silently | U until F8 and E2 |
| E-10 | Target already holds a slot for the product | D15 slot check at every flow; refused whole | 2.C.2 text | C |
| E-11 | Email change during a pending claim or transfer | 72 h hold: ownership transfers and claim consumption are held; pending claims and invitations to the old email are revoked | What happens to an **offer** addressed to the changed email is not stated; proposed: revoked like an invitation and re-offered after the hold | C, P |
| E-12 | Claim email typed wrong by staff | Staff revoke and re-issue with a reason; the wrong address never verifies | If the wrong address belongs to a real person, they could consume it | U: mitigated only by the secret and the 14-day limit; an issuer's confirmation step is not defined |
| E-13 | Two businesses of different products and one person | D15 allows one Caterly and one Rivo membership; AJ decision X1 states that a person may belong to different businesses across different products | Allowed. Each product's rule is enforced separately by `UNIQUE (user_id, product_key)`. No second membership in the same product | C (AJ decision X1) |
| E-14 | Staff account compromised or one staff member acting alone | Plan wording (quoted): AJ plus a recorded second reviewer "where possible"; audit of every step. **AJ decisions Y2.2 and Y2-A: one authorised staff member may investigate, approve a recovery and issue a recovery claim; a second reviewer is not mandatory and none is required or implied** | A single compromised or mistaken authorised staff member is not stopped by a second review. What remains: recovery permissions restricted to explicitly authorised staff (not ordinary support staff), a full audit with approval details, audit of every staff view (Y2-D), the claim process itself (the new Owner must verify and consume the claim) and the documented 7-day notice that lets a legitimate Owner object, which does not help if that Owner's inbox is the compromised one (E-04). No two-person requirement is introduced by this draft | **U (retained as an unresolved security risk)** |
| E-15 | Dispute outlasts claim expiry | Claims expire at 14 days; transfers at 7 | Extend frozen items by the lock length (D1) | P |
| E-16 | Organisation deletion while a case is open | Delete is staff-only and manual (R12) | Block deletion while a case or lock is open | P |
| E-17 | Last Owner is disabled or their membership is `disabled` | W1 plan clarification B: the floor counts **active** Owners only and a deferred trigger enforces it for an established organisation; the cap counts non-removed Owners, so a disabled Owner keeps a place | A disabled sole Owner does not satisfy the floor; the last active Owner cannot be disabled or removed. Revisions 1 and 2 said this was "not written": that was wrong | C (corrects revisions 1 and 2) |
| E-18 | Owner steps down, is disabled or is removed while their transfer offer is pending | One pending transfer per business | Under X5 only the initiating Owner can cancel. If they are no longer an Owner the offer can only be declined, expire (7 days) or be revoked by staff. Whether step-down is refused while an offer is pending, or cancels it, is not decided | U |
| E-19 | Migrated customer's real owner differs from the old system's recorded owner | O4: AJ confirms each owner out of band | Same as O4; blocked on E2 | U until E2 |
| E-20 | Ownership dispute during break-glass | Break-glass forbids team changes, ownership transfer or claims (Part 1 section 10) | Consistent: no ownership action in break-glass | C |
| E-21 | Owner authority obtained by a route other than O1, O2 or O3 | Part 3 section 3a and section 4: Owner only via O2 or O3 | AJ decisions X2 and X3: an I1 or I2 invitation never grants Owner, staff never start O3. Tests in 3.3 and 5.4 | C (AJ decision) |
| E-22 | Staff revoke an offered transfer outside an authorised case | AJ's proposed decision X5, widened by AJ's Decision Y2-B: only through an authorised recovery, dispute or security-investigation case, with an audit record; the security-investigation route needs a genuine concern, explicit authorisation, a recorded reason and the audit trail | A revocation without one of these cases, or without the four conditions, is refused; the audit row carries the recorded reason and the case reference where one exists; needs authorised staff (Y2.2) and the staff identity model (X4) | C (Y2-B decided; X5 itself is still AJ's proposal), U until X4 |
| E-23 | A co-Owner did not authorise an offer and wants to stop it | AJ's proposed decision X5: other Owners cannot independently cancel | They can only ask staff to open a dispute, which blocks acceptance. No automatic path, and the notice to co-Owners is informational | U (a consequence of X5, A2 and A3; see E-04) |
| E-24 | An existing Owner re-issues an expired claim | Part 1 section 2 "Expired": "Staff or the existing owner re-issues from Ops/Account" against O2 "Staff or Ops issues a claim" | Not decided; optional wording in 0D item 6 | U |
| E-25 | Staff access to customer business information | Y2.3: limited access to relevant information for support or recovery; no membership, no Owner authority; details deferred by AJ. **Y2-D: every staff view is audited, even when nothing is changed** | The audit of views is decided. The access policy, scope, duration, approval, any support workflow and any permissions model remain deferred and are not invented. The recovery steps in 2.B (members list, registered phone, documents) assume some access | Audit decided; access policy U (deferred by AJ) |
| E-26 | Audit identity of an unauthenticated or unknown actor | Y2.5 requires the exact actor identity | A failed claim attempt or a rate-limited visitor may have no authenticated identity; what is recorded is undefined | U |
| E-27 | Meaning of "lock access" | Y2.1; the plan has `ownership_locked`; user-level revocation is reserved for compromise events (Part 1 section 11) | Whether staff may also disable a user, a membership or a product link is not stated | U |
| E-28 | Staff revoking a suspicious offer versus X5 | Y2.1 (suspicious pending offers) against X5 (only through a recovery or dispute procedure) | **Reconciled by AJ's Decision Y2-B:** a security investigation qualifies as an authorised case, on four conditions. Ordinary support activity or an unsupported suspicion does not qualify. What makes a concern "genuine" stays undefined (E-31) | C (Y2-B), U for the threshold |
| E-29 | The previous Owner's membership in a recovery | Y2.1: staff never directly assign or transfer ownership. B2 (c) or (d) disables or removes the previous Owner | Whether staff do this directly or only through a predefined process is not stated | U |
| E-30 | Ops as an actor | O2: "staff or Ops issues a claim"; Ops provisions businesses; Ops also holds customer business records | Whether an action started in Ops is staff or system is not stated. Whether staff viewing customer information through Ops falls under Y2-D is not stated | U |
| E-31 | What counts as a genuine security concern for revoking a pending offer | Y2-B: genuine concern, explicit authorisation, recorded reason, audit trail; ordinary support activity or an unsupported suspicion does not qualify | No evidence threshold is defined, nor who may open a security investigation, nor whether it has a case record. Not invented here | U |
| E-32 | Recording staff views of customer information | Y2-D: staff identity, business, date and time, case, reason; even when nothing is changed | Not defined: what counts as one view, how long the record is kept, how it is protected, and what happens when the case or reason is missing | U |

---

## 5. Part 5: deliverables and decisions

### 5.1 Decision table for the three open questions

| Question | Documented position | Proposed rule | Alternatives | Consequences | Recommended | AJ decides |
|---|---|---|---|---|---|---|
| **A. Cooling-off** | Freed slot: open, proposed none. O3: atomic on acceptance, no hold. 72 h email hold and 7-day dispute notice exist | A1: no freed-slot hold [Proposed, open]. A2: **AJ decision: no cooling-off; O3 stays atomic on acceptance.** A3: **AJ decision: deferred** | A1: 24 to 72 h hold. A2 options not adopted: 72 h hold for every new Owner, handover only, recent targets | A2: no new state or job; authority at acceptance; the compromised sole-Owner risk stays open (E-04) because A3 is deferred | A1: none | A1 open; A2 decided; A3 deferred |
| **B. Lock-out recovery** | Staff-only procedure with lock, evidence checklist, 7-day notice, AJ plus second reviewer where possible (the plan's wording; superseded here by Decision Y2-A), then a new claim. Wrong-email case proposed to use it | Routes S1 to S6; seven-step case; previous Owner membership set to `disabled` by default, `removed` for confirmed compromise; objection moves a case to disputed; reinstatement only through staff. Staff use this route, never O3 (AJ decision X3). Approval by one authorised staff member, a second approval not mandatory (AJ decision Y2.2) | Different notice length; previous Owner kept as Admin | Needs staff identity in Platform Core; a case is at least 7 days; relies on document review and a call-back | The proposed case, with B2 option (c) as default and (d) for confirmed compromise | B1 to B5 |
| **C. Refusal message** | Fragments: O1 wording, "without revealing whose", "count only", "limit reached" | Catalogue of 13 codes; one generic claim-failure message; reference id on every support route; one audit row per refusal; never expose other businesses | Detailed messages; no reference id | Less clarity for users, no enumeration; a lookup tool for staff | The proposed catalogue and principle | C1 to C4 |

### 5.2 Exact decisions AJ must make

| ID | Decision | Options | My recommendation (not approved) |
|---|---|---|---|
| X1 | Confirm the D15 reading: one membership per **product**, or one business in total | **AJ decision (revision 3): D15 stays as approved.** One membership per Platterly product; a person may belong to different businesses across different products; no second membership within the same product. Slot uniqueness design unchanged | Decided |
| X2 | Can an Owner be created through an invitation? | **AJ decision (for review): a separate ownership-offer flow; a standard invitation never independently grants Owner.** Mechanics undecided (0C). The plan wording in 0B items 1 and 2 needs an approved amendment | Decided |
| X3 | May staff start an O3 transfer on an Owner's behalf? | **AJ decision (for review): only an existing Owner initiates a normal O3 transfer; staff use the recovery process.** Part 1 section 2 conflicts (0B, item 3) and needs an approved amendment | Decided |
| X4 | Staff identity in Platform Core: who is staff, who may issue claims, open cases, revoke offers, approve | **Partly decided by AJ (Y2.2, confirmed by Y2-A):** one authorised staff member is sufficient; a second approval is not mandatory; recovery permissions are restricted to explicitly authorised staff and ordinary support staff do not get them automatically. **Not decided, and not invented here:** how staff are identified, what makes a staff member "authorised", and who grants that | Define before `F5.1.2` and `F5.3.2`; depends on D1 and F4 |
| A1 | Freed-slot cooling-off | none / hold | none |
| A2 | Transfer cooling-off | **AJ decision (for review): no additional cooling-off; O3 stays atomic on acceptance; no holding state or activation job** | Decided |
| A3 | Out-of-band notice for a sole Owner | **AJ decision (for review): deferred; unresolved; no new recovery-contact field; the Ops billing contact is not assumed suitable.** E-04 stays an open risk; email notices are not claimed to mitigate it | Deferred |
| B1 | Who opens a case or sets the lock, and who approves recovery | **Approval is settled by AJ (Y2.2):** one authorised staff member. **Open:** who may open a case or set the lock (could ordinary support staff?) | Decide with X4 |
| B2 | Previous Owner membership after recovery | (a) stays Owner, (b) Admin, (c) disabled, (d) removed | (c) default, (d) for confirmed compromise |
| B3 | Evidence list and minimum per situation | section 2.B.2 list | accept the list; minimum is items a to d plus the call-back |
| B4 | Do Admins receive a lock notice | yes / no | yes, without names or evidence |
| B5 | Maximum time a case may stay open | none / 30 days / 60 days | 30 days, then AJ reviews |
| C1 | Refusal principle and style | as 2.C.2 | accept |
| C2 | Audit refusals that change no state | yes / no | yes |
| C3 | May the audit row store the other organisation id | yes (staff-only) / no | yes, staff-only |
| C4 | Wording is reviewed when built | yes | yes |
| D1 | Frozen claims and transfers when a lock is set | expiry extended by the lock length / expire normally | extend |
| X5 | Who may end an offered transfer before acceptance | **AJ's proposed decision (for review):** the initiating Owner cancels; the target declines; other Owners cannot independently cancel; staff revoke only through an authorised recovery, dispute or security-investigation case (Decision Y2-B), with an audit record. Gaps in 0A and 0B (items 6 and 7) | Confirm, then settle Y6 and the matrix row (0D item 5) |
| Y1 | Approve, change or reject the proposed amendments to the approved plan wording (0D, items 1 to 7) | approve all / approve some / leave the plan as it is and rely on this spec | Approve as a separate documentation task, so the plan matches AJ's decisions |
| Y2 | Staff, customer and system actors: authority, approval and audit | **AJ decision (revision 4), six parts:** (1) staff authority; (2) one authorised staff member suffices, a second approval is not mandatory, permissions restricted; (3) limited staff access to business information, details deferred; (4) system actors execute predefined approved actions only; (5) seven mandatory audit details; (6) initiator and executor recorded separately. Section 0E. The audit and actor column design (for example foreign key versus text) is **not decided** and not invented here | Decided at policy level; design open |
| Y2-A | One staff reviewer is sufficient for a recovery | **AJ decision (revision 5):** one authorised Platterly staff member is sufficient to investigate and approve; a second reviewer is not mandatory; no two-person requirement. E-14 stays an open risk | Decided |
| Y2-B | Security investigation as an authorised case for revoking a suspicious pending offer | **AJ decision (revision 5):** yes, on four conditions (genuine concern; explicit authorisation; recorded reason; audit trail). Ordinary support activity or an unsupported suspicion does not qualify. Pending offers only | Decided; threshold for "genuine" open (E-31) |
| Y2-C | Recovery claim expiry | **AJ decision (revision 5):** the system expires a recovery claim after its approved 14-day validity; a predefined action, not an ownership decision; no renewal process | Decided |
| Y2-D | Auditing staff viewing of customer business information | **AJ decision (revision 5):** every view is recorded, even without changes: staff identity, business, date and time, case, reason. Recording only; no access system, policy, duration, workflow or permissions model | Decided; details open (E-32) |
| Y3 | Business fields on `organisations` (the W1 table lists none; O1 hashes a name) | (a) name now, other fields later by additive migration; (b) name, type and city now; (c) none now | (a) |
| Y4 | Where organisation legacy ids are stored (`legacy_mappings.user_id` is NOT NULL and `kind` allows only `user`, so it cannot hold them) | (a) a separate table in `F3.2.1`; (b) a separate table later (`F10.1.1`) by additive migration; (c) reshape `legacy_mappings` | (b), because the content depends on E2 and the table can be added without touching accepted tables |
| Y5 | What `F3.2.1` waits for | (a) acceptance of the whole spec; (b) only confirmation of the Part 3 section 3b slot design (done by X1) | AJ's call; the plan's `F3.2.1` row lists only `F3.1.1` and `F0.1.4`, section 3b asks `F5.1.0` to confirm the slot design, and the wave order puts `F5.1.0` after `F3.2.2` |
| Y6 | Fresh authentication for cancelling an offer (decline needs only sign-in) | (a) required for cancel; (b) required for neither; (c) required for both | (a), as D3 requires it for every Owner-only action |

### 5.2a Decision register

| ID | Topic | Status | Blocks `F3.2.1`? |
|---|---|---|---|
| X1 | D15 reading (per product, cross-product allowed) | **Decided** by AJ (rev 3) | No (confirms the slot key) |
| X2 | Owner never by invitation; separate offer flow | **Decided** by AJ (rev 2); mechanics undecided (0C) | No |
| X3 | Only an Owner starts O3; staff use recovery | **Decided** by AJ (rev 2); plan wording conflicts (0B 3) | No |
| X4 | Staff identity | **Partly decided** by AJ (Y2.2); the identity model is open | Its audit shape only, via Y2 |
| X5 | Ending an offered transfer | **AJ's proposed decision**, for review | No |
| A1 | Freed-slot cooling-off | Open (recommended: none) | Only if a hold is chosen |
| A2 | Transfer cooling-off | **Decided** by AJ (rev 2): none | No |
| A3 | Out-of-band sole-Owner notice | **Deferred** by AJ (rev 2); E-04 open | No |
| B1 to B5 | B1: approval authority settled by Y2.2, who may open a case or set the lock open. B2 to B5: previous Owner, evidence, Admin notice, case age | Open (B1 partly decided) | No (B5 and D1 may want a lock start time, addable later) |
| C1 to C4 | Refusal principle, auditing refusals, other organisation id, wording | Open | No, provided `audit_logs` has a JSON payload (5.3) |
| D1 | Frozen items when a lock is set | Open | No |
| Y1 | Plan wording amendments (0D) | Open | No |
| Y2 | Staff, customer and system actors | **Decided** by AJ (rev 4) at policy level; audit and actor column design not decided | Requirement for the `F3.2.1` design: the audit columns must carry the seven details and a separate initiator and executor. No further AJ decision is needed unless AJ wants to fix the column design now |
| Y2-A | One staff reviewer sufficient | **Decided** by AJ (rev 5) | No |
| Y2-B | Security investigation may authorise offer revocation | **Decided** by AJ (rev 5); threshold open (E-31) | No |
| Y2-C | System expires a recovery claim after 14 days | **Decided** by AJ (rev 5) | No |
| Y2-D | Staff views of customer information are audited | **Decided** by AJ (rev 5); details open (E-32) | Adds to the audit record the F3.2.1 design must carry (with Y2) |
| Y3 | Business fields | Open | **Yes** |
| Y4 | Organisation legacy mapping | Open | Only if option (a) |
| Y5 | What `F3.2.1` waits for | Open | Yes (it defines the gate) |
| Y6 | Fresh auth for cancel | Open | No |

### 5.3 Dependencies and gates before `F3.2.1` (rechecked in revision 3)

Method: I read each decision against what `F3.2.1` actually creates (W1 plan section 4 table list and clarification B, Part 3 section 3b, and the Stage 1 migration for `legacy_mappings`), and against the migration guard (`scripts/check-migrations.mjs`). Nothing was run and no database was read. No decision is treated as irrelevant without a stated reason.

**5.3.1 Decisions that affect the initial organisation schema**
| Item | Touches `F3.2.1`? | Reason | Status |
|---|---|---|---|
| X1 | No change | Confirms `membership_product_slots` with `UNIQUE (user_id, product_key)` as designed | Decided |
| Y2 actors and audit (X4's shape) | **Yes (requirement)** | AJ's Y2 decisions require every relevant audit record to carry: actor category; exact actor or system-process identity; action; affected business; date and time; reason or case reference; approval details; an initiator separate from the executor; and, under Decision Y2-D, a record of every staff view of customer business information. `F3.2.1` creates `audit_logs` ("table only here"), `outbox_events.resolved_by` (a "named staff actor") and `organisation_product_unlinks.unlinked_by` (W1 plan section 4). The plan defines none of these fields, and the F3.3.1 audit pattern (actor, action, subject, before and after) has one actor. Whether to use foreign keys or text references for staff and system identities is a design choice this draft does not make; no staff model is invented | Policy decided; design open |
| Y3 business fields | **Yes** | The W1 `organisations` table lists no name, type or city, yet O1 hashes a name and the prototype shows all three | Open |
| Y4 organisation legacy ids | **Yes, if option (a)** | `legacy_mappings.user_id` is `NOT NULL` and `kind` allows only `user` (Stage 1 migration), so it cannot hold organisation ids. A new table is additive and can wait | Open |
| A1 freed slot | Only if a hold is chosen | A hold would need new storage; "none" (recommended) needs none | Open |
| C2, C3, reference id | None expected | Reason code, reference id and the other organisation id can live in the audit row's JSON payload (F3.3.1 pattern: actor, action, subject, before and after). Confirm the `audit_logs` design has such a payload and that nothing goes in the `organisation_id` foreign key column | Open, check at design |
| B2 | No, with (c) or (d) | `disabled` and `removed` already exist. A new status value would change the CHECK | Open |
| B5, D1 | Possibly | Measuring a lock's length needs a lock start time; `organisations` has the `ownership_locked` boolean only. Can be added later (`F5.3.2` lists "columns") | Open |
| E-17 | No | Already specified: floor counts active Owners, cap counts non-removed, deferred trigger | Covered |
| X2, X3, X5, A2, A3 | No | Their tables are `F5.2.1`, `F5.3.1` and `F5.3.2`. `F3.2.1` has no invitation, offer or transfer table. The database owner trigger fires on any active-owner insert whatever the route, so "an invitation never grants Owner" is enforced in services and in the later tables (for example a role CHECK on invitations), not in `F3.2.1`. `F3.2.2` must also keep `addMember` and `changeRole` from becoming a way to grant Owner outside O1 to O4 | Decided or deferred |
| Migration guard | Process | The guard flags `ON DELETE CASCADE`, which the slot, member and link design uses (W1 plan section 8). The `F3.2.1` migration will therefore need a `-- data-safe-approved:` line, while W1 plan section 7 says new tables need none. Read from the guard's patterns, not run | Open |

**5.3.2 Decisions needed for later ownership, invitation and recovery workflows**
| Workflow | Decisions |
|---|---|
| Claims (`F5.1.1`), recovery operations (`F5.1.2`) | X4, B1 to B5, D1, C1 to C4 |
| Invitations and offers (`F5.2.1`, `F5.3.1`) | X2 mechanics (0C), X5, Y6, E-18 |
| Dispute tooling (`F5.3.2`) | X4, B1, B2, B5, D1 |
| Plan wording | Y1 |
| Unresolved risk | E-04 (A2, A3) |

**5.3.3 External dependencies**
| Dependency | Needed for | Blocks `F3.2.1`? |
|---|---|---|
| D1 and D2 | Real fresh-authentication and verified-email enforcement; staff identity (X4) | No (W1 tests the predicate only) |
| D5 | Every notification | No: the Gate B-1 record says D5 blocks `F4.1.1` only, although the Gate B-1 row in the plan lists D5 among decisions needed "before `F3.2.1` onward". The later, approved decision record is followed here |
| E2 | O4 content and migrated owners | No (it can inform Y4) |
| F0.1.4 | Part 3 `F3.2.1` row lists D3 and D4 | Both approved |

**5.3.4 Items that need their own implementation approval (none given)**
`F3.2.1` implementation itself; starting or creating any PostgreSQL cluster or database for it (the Stage 2 cluster is stopped); the `data-safe-approved` line for the cascading deletes; any migration on `platterly_platform`; Prisma Client regeneration; and each commit.

**5.3.5 Gates**
| Gate | What | Status | Blocks `F3.2.1`? |
|---|---|---|---|
| G1 | What `F3.2.1` waits for (Y5): acceptance of the whole spec, or only the section 3b slot confirmation | Open | Yes, it defines the gate |
| G2 | Schema-affecting decisions: the Y2 audit requirement (design), Y3 and, if option (a), Y4; A1 only if a hold is chosen. X1 is cleared | Open | Yes |
| G3 | D1 and D2 | Open | No |
| G4 | D5 | Open | No (see 5.3.3) |
| G5 | Staff identity (X4); the approval rule is decided by Y2.2 | Open (identity model) | Its audit shape only, through Y2 |
| G6 | E2 | Open | No |
| G7 | Implementation, cluster or database, migration and commit approvals | Not given | Yes |

Recording AJ's decisions authorises nothing, and `F5.1.0` is not accepted.

### 5.4 Test plan additions for this spec (extend the plan's list; none written)

| Area | Cases |
|---|---|
| Claims | Plan list; slot taken at consume; cap with pending transfers; lock blocks consume; frozen expiry (D1) |
| Transfers | Plan list; transfer at a full cap in one transaction; a non-Owner and a staff member cannot start; a standard invitation never yields an Owner; another Owner cannot cancel; the initiator can cancel before acceptance and not after; the target can decline; staff revoke only inside a case, with the case reference in the audit row; cancel racing accept |
| Recovery | Lock set at open; lock does not block normal use; objection moves to disputed; employee refused; reinstatement is never automatic; second-reviewer rule enforced |
| Refusals | One test per code for text and for what is not revealed; the same text for every claim failure; the reference id leaks nothing; one audit row per refusal if C2 is yes |
| Security | No secret, token or OTP in any audit row; refusal timing and text do not distinguish an existing from a missing account |
| Actors and audit | Every relevant staff, customer or system action writes all seven details (actor category, exact identity, action, affected business, date and time, reason or case, approval). Initiator and executor are separate fields; a staff decision is never attributed to the system. Ordinary support staff cannot issue a recovery claim, set the ownership lock if that is restricted (B1), or approve a recovery. One authorised staff member can approve and issue; no second approval is required. The system cannot assign ownership, resolve a dispute or make a discretionary ownership decision. System actions limited to expiring offers and invitations by their rules, recording audit events and enforcing approved restrictions. A staff revocation outside an authorised recovery, dispute or security-investigation case, or without the four Y2-B conditions (genuine concern, explicit authorisation, recorded reason, audit trail), is refused (if X5 is adopted). Staff viewing of customer business information writes a record with staff identity, business, date and time, case and reason even when nothing is changed (Y2-D). A recovery claim not consumed within its 14 days is expired by the system, and the system cannot approve a claim, reject a dispute or assign ownership (Y2-C). No test requires or assumes a second reviewer (Y2-A) |
| Races | Transfer versus claim issue and consume (CL-7, CL-8); cancel versus accept; removal of the target before acceptance |

---

## 6. Summary for review

| Item | Position |
|---|---|
| Documents changed | This file only (revision 5). Changes from revisions 2 to 4 are kept |
| New in revision 3 | X1 recorded as decided; X5 recorded as AJ's proposed decision with its gaps; proposed amendments to the approved wording (0D, six items); A3 and E-04 stated without claiming that notices mitigate; the `F3.2.1` dependency analysis redone (5.3); new decisions Y1 to Y6; register in 5.2a |
| New in revision 4 | AJ's six Y2 decisions recorded in 0E with their representation and checks; actor rules in 1.4; recovery steps, workflow 1, workflow 4, workflow 7, C.3 and the register updated; the earlier recommendation of a mandatory second reviewer withdrawn; gaps E-25 to E-30 and 0B items 9 and 10 added; wording 0D item 7 (marked optional in revision 4; no longer marked optional in revision 5); decision register, 5.3 and 5.4 updated |
| New in revision 5 | AJ's follow-up Decisions A to D recorded as Y2-A to Y2-D (0E.5); staff views audited (0E.2a); the second-review wording corrected or labelled as quoted plan wording; Y2-B reconciled with X5 and E-28; Y2-C added to the claim states and system actions; E-14, E-22, E-25, E-28, E-30 updated; E-31 and E-32 and 0E.4 rows 13 to 15 added; register, 5.2, 5.2a and 5.4 updated |
| Approved rules contradicted | AJ decisions X2 and X3 contradict literal wording in the approved plan (0B, items 1 to 3). Items 4, 5 and 8 are inconsistencies inside the plan. The plan is not edited; amendments need AJ's approval (Y1) |
| Corrections to earlier revisions | E-17 was marked unresolved but W1 plan clarification B already specifies it (now covered). Gate G1 had treated acceptance of the whole spec as required; the plan's own text is narrower (Y5). W1 plan section 7 (new tables need no approval line) does not match the migration guard's treatment of cascading deletes |
| Unresolved security risks | **E-04** (compromised sole Owner can transfer ownership at acceptance; notices do not mitigate; A2 and A3; Y2-B helps only before acceptance), **E-14** (one authorised staff member can approve a recovery; Y2.2 and Y2-A add no second review), **E-23** (co-Owner has no veto under X5), E-12 (mistyped claim email) |
| Other unresolved cases | E-09 (live Caterly conflicts), E-18, E-19, E-24, the Y2 gaps E-25 to E-30 (0E.4) and the new E-31 and E-32 |
| Decisions awaiting AJ | A1, B1 (who may open a case or set the lock), B2 to B5, C1 to C4, D1, X4 (the identity model), Y1 and Y3 to Y6, confirmation of X5, and the gaps in 0E.4. X1, X2, X3, A2 and Y2-A to Y2-D are decided and A3 is deferred; Y2 is decided at policy level, all for AJ's review |
| Next step | AJ's decisions on the open items in 5.2a and on the wording amendments (Y1), then (if wanted) a further draft, then acceptance. Only then can `F3.2.1` be proposed for approval |

---

## 7. Revision log

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-04 | First draft: architecture, the three open questions, seven workflows, edge-case register, decision list |
| 2 | 2026-11-04 | Recorded AJ decisions X2, X3, A2 and A3 (section 0A, 0B, 0C). Removed the 72 h holding state, the delayed activation and the cancel-during-hold workflow from the recommended workflow (2.A.2, 3.1, 3.3, 3.8, 5.1, 5.2, 5.4). Added 2.A.3 (A3 deferred), Decision X5 (who may cancel an offered transfer) and edge case E-21. Retained E-04 as an unresolved risk. Updated the status table, label list, section 0 rows 0.2 to 0.4, the 7-day notice alternatives, the refusal catalogue (`OWNER_CAP`, `HOLD_ACTIVE`, `OWNERSHIP_LOCKED`, `SLOT_TAKEN_TARGET`), E-02, E-07 and E-11, and the gate paragraph in 5.3. F5.1.0 is still not accepted and F3.2.1 is still not authorised |
| 3 | 2026-11-04 | Recorded X1 (decided) and X5 (AJ's proposed decision) in 0A. Added 0B items 5 to 8 and the new section 0D (proposed replacement wording for the approved plan; not applied). Rewrote the consequences of A2 and A.3 so that the compromised sole-Owner transfer is stated as an unresolved risk and notices are not claimed to mitigate it. Rewrote the O3 diagram, workflow 2 and workflow 7 for X5 (cancel, decline, staff revoke). Added the owner-floor ordering note to B.3. Register: E-04 and E-18 rewritten, E-13 and E-17 now covered (E-17 corrects revisions 1 and 2), E-22 to E-24 added. Added Y1 to Y6 and the register 5.2a. Rewrote 5.3 (schema-impact check, later workflows, external dependencies, separate approvals, gates). Updated 5.4 and section 6 |
| 4 | 2026-11-04 | Recorded AJ's six Y2 decisions (staff authority; one authorised staff member suffices and permissions are restricted; limited staff access with details deferred; system actors execute predefined actions only; seven mandatory audit details; initiator and executor recorded separately) in new section 0E and new 1.4. Updated 0A (Y2 row), 0B (items 9 and 10), 0D (optional item 7), 2.B steps 5 and 6 and B.5, 3.2, 3.5, 3.8, C.3, the register (E-14, E-22, new E-25 to E-30), 5.2, 5.2a, 5.3.1, G5 and 5.4. Withdrew the recommendation of a mandatory second reviewer. Staff identity model, access policy and audit design remain undecided and are not invented. F5.1.0 is still not accepted and F3.2.1 is still not authorised |
| 5 | 2026-11-04 | Recorded AJ's Decisions A to D, as Y2-A to Y2-D: one staff reviewer sufficient (second reviewer wording corrected or labelled as quoted plan text; E-14 kept as an unresolved risk); a security investigation qualifies as an authorised case for revoking a suspicious pending offer on four conditions (reconciled with X5 and E-28; threshold open, E-31); the system expires a recovery claim after 14 days (no renewal process); staff views of customer business information audited (5 items; access policy still deferred; E-32). Added 0E.2a and 0E.5, 0E.4 rows 13 to 15, updated 0A, 0B items 9 and 10, 0D items 1 and 7, 0.5, 1.4, B.0, 2.B, 3.1, 3.2, 3.3, 3.8, C.3, the register, 5.1, 5.2, 5.2a, 5.3.1 and 5.4. Staff identity model, access policy and audit design remain undecided and are not invented. F5.1.0 is still not accepted and F3.2.1 is still not authorised |
