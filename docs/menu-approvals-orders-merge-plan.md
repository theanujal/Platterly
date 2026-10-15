# Menu Approvals + Orders merge plan

Status: **plan approved by AJ (decisions 1 to 15 below). Phase 0 done; Phase 1 accepted by AJ; Phase 2 built, then hardened (kitchen lock and concurrency, section 8.14), uncommitted and waiting for AJ's review. Phases 3 (section 9), 4 (section 10) and 5 (section 11) built, uncommitted. The single comprehensive verification pass has not been run yet.**
Written against `main` at `6525313`. Every file, function and field named here was read in the code when this was written; where something is an interpretation or an open question it says so.

Related: `src/modules/menu-approvals/README.md` (module notes, including the Phase 0 concurrency section), `docs/menu-approvals-orders-merge-legacy-data-report.md` (the read-only report for Decision 4), `scripts/report-approval-order-mismatch.sql` (the query behind it).

---

## 1. Why

Today a team member works one order in two places. The **Order page** (`/orders/[id]`) holds the commercial record, and the **Menu Approvals** pages (`/menu-approvals`, `/menu-approvals/[id]`) hold the approval workflow: send, recall, hand-off to the kitchen, notes, versions. The Order page already shows a read-only slice of the approval (banner, Menu History card, a "Recall to edit" button) and links out to Menu Approvals for the rest. The goal is one place: **Orders is the primary entry, and the approval work lives in a Menu Approval tab on the order.**

---

## 2. Current architecture (as built)

### 2.1 Data relationships

```
Order (status: OrderStatus, derived — see 2.3)
  └─ Event            (one per Order, created and kept in step automatically; Event.orderId, Event.assignedKitchenId)
       └─ MenuSelection   (Event.id → MenuSelection.eventId, unique: one approval per event)
            ├─ status: MenuSelectionStatus, kitchenProductionStatus, currentVersion, lockedAt
            ├─ isCustomMenu / customPricePerPlate / chosenMenuId  (Custom Menu: the kitchen quotes the plate price)
            ├─ MenuSelectionItem[]   flat rows mirrored from the order's meal plan
            ├─ MenuVersion[]         one per send; `snapshot` JSON is exactly what the customer saw; sentAt, supersededAt
            │    └─ MenuVersionItem[]
            └─ MenuApprovalNote[]    authorType CUSTOMER | KITCHEN | TEAM, versionNumber
Order.mealPlanEntries → items       the planner the team edits (shared by the Order form and Menu Approvals)
StatusChange                        orderId, menuSelectionId?, subject ORDER | MENU_APPROVAL, source AUTOMATIC | MANUAL, reason
SecureAccessToken                   resourceType/resourceId → the customer's approval link (token unique, expiresAt, revokedAt)
```

- The link between an order and its approval is **Order → Event → MenuSelection**. An order with no Event Type has no Event and no approval (`ensureOrderMenuSelection` returns null without an Event Type).
- An Order can in principle own several Events, each with its own MenuSelection (`deriveOrderStatus` takes a list); a normal order has exactly one.

### 2.2 Statuses

| Vocabulary | Values | Defined in |
|---|---|---|
| Menu approval (`MenuSelectionStatus`) | DRAFT, SENT_TO_CUSTOMER, CUSTOMER_REVIEWING, CHANGES_REQUESTED, CUSTOMER_APPROVED, FINAL_LOCKED | `prisma/schema.prisma`, labels/tones in `src/modules/orders/order-status.ts` |
| Kitchen stage (`KitchenProductionStatus`) | PENDING, IN_PREPARATION, READY, DELIVERED, CANCELLED (meaningful once FINAL_LOCKED) | same |
| Order (`OrderStatus`) | PENDING_REVIEW, AWAITING_CUSTOMER_APPROVAL, APPROVED, SENT_TO_KITCHEN, COMPLETED, CANCELLED | same |

### 2.3 How Order status follows the approval (Decision 1 keeps this)

`orderStatusForSelection` (`order-status.ts`): DRAFT and CHANGES_REQUESTED → PENDING_REVIEW; SENT_TO_CUSTOMER and CUSTOMER_REVIEWING → AWAITING_CUSTOMER_APPROVAL; CUSTOMER_APPROVED → APPROVED; FINAL_LOCKED → SENT_TO_KITCHEN, or COMPLETED when the kitchen stage is DELIVERED, or CANCELLED when it is CANCELLED. `deriveOrderStatus` takes the least-advanced live selection (Cancelled only if every selection is). `syncOrderStatus` (`menu-approval.ts`) writes it after every change and records an AUTOMATIC `StatusChange`. A person can set a status by hand through `changeStatusManually` (`manual-status.ts`): a reason of at least 5 characters is required, the menu approval and the order move together, and it is recorded and audited.

### 2.4 The customer link (must not change)

- Public route `/menu-approval/[token]` (`src/app/menu-approval/[token]/`), no login. Distinct from the internal `/menu-approvals` (plural) route.
- `sendMenuForApproval` (`approval-link.ts`) freezes the next `MenuVersion`, supersedes earlier versions, revokes their links, issues a version-specific token (14 days; at least 30 once approved so the venue form can come later) and moves the order to Awaiting Customer Approval. Only the latest version's link can approve, and only while the menu awaits the customer. After approval the same link carries Venue & Delivery and then the read-only Confirmation. `getActiveApprovalUrl` returns the live link for the team to copy.
- The public storefront creates its own orders with a MenuSelection already at the team's review stage (`submitDraft` in `storefront-draft.ts`).

### 2.5 The kitchen hand-off

"Approve & Send to Kitchen" (`approveAndSendToKitchen` → `transitionInTransaction` → FINAL_LOCKED) is one transaction since Phase 0: status, history rows, order sync, audit entry and the **Draft invoice** are written together or not at all (`KitchenHandoffError` rolls the lot back). Notifications and stock put-back run after commit. The kitchen then moves the stage with `setKitchenProductionStatus` (Kitchen Dashboard, `menus: edit`, not `menus: approve`).

### 2.6 Pages and components today

| Surface | Route / file | Gate | What it does |
|---|---|---|---|
| Menu Approvals queue | `src/app/(app)/menu-approvals/page.tsx` | `menus: approve`; location filter via `getActiveLocation` | Card/list of every MenuSelection (`listMenuSelectionsForKitchen`), status filter bar. No date filter. |
| Menu Approval review | `.../menu-approvals/[id]/page.tsx` loads data, renders `[id]/_components/menu-approval-review.tsx` (816 lines, one client component) | `menus: approve` + `assertKitchenAtMyLocation`; `orders: edit` only decides whether "View Order" shows (`canOpenOrder`) | Header + actions, stage banner, customer-link bar, venue-details status, version view/compare, custom-menu price card, Menu Planning, Menu Status panel, Notes, Menu History (+ dialog), Pricing Details |
| Server actions | `.../menu-approvals/actions.ts` | each: `requireActiveOrganization` + `requirePermission({ menus: ["approve"] })` + `assertMenuSelectionAtMyLocation` (or `assertOrderAtMyLocation`) | `updateMenuApprovalItemsAction`, `approveAndSendToKitchenAction`, `changeMenuStatusAction`, `sendMenuForApprovalAction` (by order or by selection), `recallMenuAction`, `setCustomMenuPriceAction`, `updateMenuApprovalMealPlanAction`, `getMenuForApprovalPickerAction`, `addMenuApprovalNoteAction` |
| Order page | `src/app/(app)/orders/[id]/page.tsx` → `EditOrderClient` → `order-form.tsx` `FormTabs` | **`requirePermission({ orders: ["edit"] })`** + `assertOrderAtMyLocation` | Tabs: Order Details, Guests & Menu Planning, Additional Details, Pricing & Payment, Inventory, Expenses, Staffing & Logistics. Sidebar: `OrderStatusCard`, `OrderSummaryCard`, `OrderApprovalPanel` (read-only Menu History, venue status, link to Menu Approvals). Above the planner: `MenuStatusBanner` (`menuPlanPhase`: editable / recall / locked) with `RecallMenuButton`. |
| Orders list | `src/app/(app)/orders/page.tsx` | `orders: view`; `listOrders(... when: "upcoming")` | Orders whose event is over never show (`whenWhere`: `eventEndDate >= today`). `events.menuSelection` status is already loaded for the card's approval callout. |
| Sidebar / nav | `components/app-shell/app-sidebar.tsx`, `nav-permissions.ts` | `/menu-approvals` → `menus: approve` | Separate "Menu Approvals" entry |
| Cross-links | `order-approval-panel.tsx`, `menu-status-banner.tsx` (via `page.tsx`) | | Both link to `/menu-approvals/{menuSelectionId}` |

The planner (`MenuPlanningSection`, `src/components/catalog/menu-planning-section.tsx`) is the same component on both pages; on Menu Approvals it saves through `updateMenuApprovalMealPlanAction`, on the Order page through the order form.

### 2.7 Permissions today

- `menus: approve` is held by `owner` and `salesEvents` (`src/lib/auth/permissions.ts`); `manager` and `kitchen` do not have it. `orders: edit` is held by `owner`, `manager`, `salesEvents`. Role permissions are also editable per business (Manage Role Permissions, enforced in `require-session.ts`), so a business can hold `menus: approve` without `orders: edit` even though no built-in role does.
- Today a user with `menus: approve` and no `orders: edit` can work the whole approval on `/menu-approvals/[id]` (including editing the meal plan and quoting a custom price) but **cannot open the order**: `/orders/[id]` requires `orders: edit`. Menu Approvals was deliberately built so "the approving team needs no order access" (comment on `getMenuForApprovalPickerAction`).

---

## 3. Approved decisions (AJ)

| # | Decision | Approved wording |
|---|---|---|
| 1 | **Order status** | Keep the existing behaviour where `Order.status` is synchronized from menu approval status and kitchen stage. Do not redesign order and approval statuses as independent workflows in this merge. Preserve the existing status vocabularies and synchronization logic. The UI may display Order Status and Menu Approval Status separately, but they must continue to follow the current business rules. |
| 2 | **Past-event orders** | Add a separate **Past** filter/view for past-event orders in the unified approval workflow, hidden by default. Past-event orders must remain accessible when approval work is still outstanding. Preserve existing date and status behaviour everywhere else. |
| 3 | **Permissions** | Preserve `orders: edit` and `menus: approve` as separate permissions. A user who has `menus: approve` but lacks `orders: edit` must be able to access the relevant order in **read-only mode**, where authorized by existing business and location access rules. They may perform explicitly permitted menu approval actions but must not edit order details. Do not weaken server-side permission checks or grant access across businesses. |
| 4 | **Legacy development records** | Eight development orders have an Order status that does not match their menu selection, and nineteen have no menu selection. Document them and prepare a read-only report with recommended handling. **Do not modify, delete, repair or migrate these records.** AJ reviews and approves any cleanup separately. |

AJ's go-ahead for Phase 1 also confirmed decisions 1 to 4 as written, and added a fifth, about where the extracted components live:

| # | Decision | Wording |
|---|---|---|
| 5 | **Component location** | Use `src/modules/menu-approvals/_components/review/` for the extracted review components unless the repository structure shows a concrete incompatibility. (None found; see 6.4 for the two layering notes.) |

AJ accepted Phase 1 and then confirmed five more decisions for Phase 2:

| # | Decision | Wording |
|---|---|---|
| 6 | **Read-only approval access** | A user with `menus: approve` and valid business/location access may open a restricted read-only order view without `orders: edit`. All existing server-side authorization checks stay. |
| 7 | **Planner editing** | Approval-only users may edit the menu planner only during the existing editable workflow stages (Needs Review and Changes Requested). They cannot edit general order details. |
| 8 | **Custom-menu pricing** | Approval-only users get no new pricing permission. The existing permission model is inspected and the right guard recommended (section 8.7). |
| 9 | **Past-event view** | The Past view includes past-event orders with outstanding approval work: Needs Review, awaiting customer approval, Changes Requested, and Approved but awaiting kitchen hand-off. Completed and cancelled orders are excluded by default. |
| 10 | **Post-approval price changes** | No price change after customer approval or kitchen hand-off without a deliberate revision and re-approval. |

AJ answered the five Phase 2 questions (8.8) and approved building Phase 2:

| # | Decision | Wording |
|---|---|---|
| 11 | **One planner (Q1)** | Once a menu selection exists, the planner in the main Order form is read-only and the Menu Approval tab is the only place to edit the meal plan. Both views read the same stored data, with no independent editable drafts. The affected `menu-approvals.spec.ts` step is updated; the customer approval workflow is preserved. |
| 12 | **Edit-only users (Q2)** | `orders: edit` without `menus: approve`: the Menu Approval tab, status and version history are visible, no approval actions. `menus: approve` without `orders: edit`: the restricted approval view. Permissions enforced on the server, business and location isolation preserved. |
| 13 | **Custom-menu quote before Send (Q3)** | A custom menu cannot be sent until its price has been quoted, with a clear message. No price is assigned silently and no pricing permission is bypassed. |
| 14 | **Price freeze (Q4)** | The server rejects real price-field changes by `orders: edit` users in Awaiting Customer Approval, Customer Reviewing, Customer Approved and Sent to Kitchen, allows unchanged values, and does the stage check under the same lock and transaction as the write. Legitimate changes use Recall → edit → Send Updated → customer re-approval. After the kitchen hand-off, a price change is not possible through an ordinary edit or a manual status change alone: the revised price must be re-approved by the customer. No new permission. The order save and its meal-plan save are one atomic operation. |
| 15 | **Notes on Completed orders (Q5)** | Refused on the server; existing notes and history stay readable. |

### Interpretations: resolved and still open

| Question | Status |
|---|---|
| Does read-only order access need `orders: view`, or is `menus: approve` alone enough? | **Resolved by Decision 6**: `menus: approve` plus business and location access. The Orders *list* still needs `orders: view`; how approval-only users reach orders from navigation is a Phase 3/4 question (8.9). |
| Are the planner edit and the price quote permitted actions for an approver without `orders: edit`? | **Planner: yes** (Decision 7, only in the editable stages, which the server already enforces). **Price quote: no new permission** (Decision 8; recommendation in 8.7). |
| What counts as outstanding approval work for a past-event order? | **Resolved by Decision 9.** In menu-approval terms: DRAFT (Needs Review), SENT_TO_CUSTOMER and CUSTOMER_REVIEWING (awaiting customer approval), CHANGES_REQUESTED, CUSTOMER_APPROVED (approved, awaiting hand-off). Excluded: FINAL_LOCKED, and any order whose status is Completed or Cancelled. An order with no menu selection has no approval work item, so it is not in the default Past view (Phase 3 can still list it as Not Started under "all past"). |
| Should a custom-menu price change be limited to certain stages? | **Resolved by Decision 10**: yes, only in Needs Review and Changes Requested (8.6, 8.7). |
| Does an `orders: edit` user without `menus: approve` see the approval? | **Still open.** Proposal (8.3): a read-only Menu Approval tab with no action buttons. |

## 3b. Permission boundaries (verified in the code, 2026-10-16)

Phase 1 changes none of this; it is written down here so Phase 2 builds approval-only access on what exists. Nothing in Phase 1 adds, removes or loosens a check.

### Today: what every approval request has to pass

| Layer | Check | Where |
|---|---|---|
| Signed in, active business | `requireActiveOrganization`: a disabled member gets 403, a business whose plan has lapsed goes to `/subscribe` | `src/lib/auth/require-session.ts` |
| Permission | `requirePermission({ menus: ["approve"] })` on the page and on **every** action. It reads the member's role in that business and applies the business's saved role overrides (`sessionAllows` → `roleAllows`). Deny by default. | `require-session.ts`; each action in `menu-approvals/actions.ts` |
| Business isolation | Every module function reads with the caller's `organizationId` (`findFirstOrThrow({ where: { id, organizationId } })`); the page loads through `getMenuSelection(organizationId, id)`. A selection of another business is "not found". | `menu-approval.ts`, `approval-link.ts`, `review-data.ts` (tested in `review-data.test.ts`) |
| Location | A member held to one location gets a 404 outside it: `assertKitchenAtMyLocation` on the page, `assertMenuSelectionAtMyLocation` / `assertOrderAtMyLocation` on each action (an action is an open HTTP endpoint, so a hand-made call is checked too). `location-guards.test.ts` lists `menu-approvals/actions.ts`. | `src/modules/locations/active-location.ts` |
| Workflow stage | Server-side, whatever the UI shows: planner edits only while DRAFT or CHANGES_REQUESTED (`updateMenuApprovalMealPlan` / `EDITABLE_STATUSES`); send only from DRAFT or CHANGES_REQUESTED; status moves only along `VALID_TRANSITIONS`; a hand-made status change needs a reason of 5+ characters and is refused on a completed order. | `menu-approval.ts`, `approval-link.ts`, `manual-status.ts` |
| Audit | Plan edits (`menu_selection.meal_plan_updated`), custom price (`menu_selection.custom_price_set`, with the new price and guests, no "before" value), status changes and the hand-off are audited and recorded in the status history. | same modules |

### Approval-only access in Phase 2 (confirmed in principle by Decision 6; details in 8.3)

A user with `menus: approve` and no `orders: edit` must open the order **read-only** without gaining order editing. Today `/orders/[id]` needs `orders: edit` and every order-changing action in `orders/actions.ts` is guarded by `orders: edit` (or `create` / `delete`), which already stops a direct call.

1. The order page decides the mode from two checks: `orders: edit` means the editable page as today; otherwise `menus: approve` means the read-only view; otherwise 403 as today. Both modes still require the active business, `assertOrderAtMyLocation` and a business-scoped read.
2. The read-only view is **its own view**, not the editable order form with disabled fields, and it loads only what it shows. It does not mount any order-edit action, so there is nothing to call. Sections that have their own permission (payments, expenses, staffing, inventory) stay behind it.
3. The Menu Approval tab uses the Phase 1 components with the same actions (`menus: approve`, location check, stage rules), so approval-only users can do exactly what they can do on `/menu-approvals/[id]` today and nothing else.
4. A user with `orders: edit` but not `menus: approve` sees the approval status read-only (as the order page's banner does today) and no approval buttons. Open: confirm this reading.
5. Required tests before Phase 2 is done: the four-way permission matrix (both, approve-only, edit-only, neither) for the page and for each action; a foreign business's order and a held member's other-location order return not-found; an approval-only user's direct call to an order-save action is refused.

---

## 4. Intended unified experience

- **Orders** is the main entry. Sidebar "Menu Approvals" is replaced by Orders (Phase 4); Menu Approvals URLs keep working by redirect.
- **Order Details** gains a **Menu Approval** tab holding everything now on `/menu-approvals/[id]`: Send / Send Updated / Recall / Approve & Send to Kitchen, copy link, venue-details status, notes, version history and comparison, manual status with history, custom-menu pricing.
- **Orders list** shows Order Status and a separate Menu Approval Status column, approval filters, and a Past view (hidden by default). Orders with no menu selection show as **Not Started**.
- **Read-only mode** for users with `menus: approve` but not `orders: edit`.
- The public customer link `/menu-approval/[token]` and its token behaviour do not change in any phase.

---

## 5. Phases

| Phase | Scope | Status |
|---|---|---|
| 0 — Concurrency hardening | Status changes, kitchen hand-off with atomic Draft invoice, first send and kitchen stage changes are each one locked transaction. Tests: `approval-concurrency.test.ts`, `first-send-and-kitchen-concurrency.test.ts`. Preserve; do not redo. | **Done** (commit `6525313`; `main` equals `origin/main` when this was written) |
| 1 — Extract reusable approval UI | Split the review page into reusable components that accept an order context; the existing Menu Approvals pages stay fully functional and unchanged to the user. Detailed in section 6. | **Done and accepted by AJ** (uncommitted; commit needs fresh approval) |
| 2 — Integrate into Order Details | Menu Approval tab on the order; reuse the Phase 1 components and the existing server actions; restricted read-only order view for approval-only users; server-side price freeze after approval. Scope in section 8. | **Done in code, verified, uncommitted** (section 8.13) |
| 3 — Unified Orders list | Menu Approval status column, approval filters, Past view (Decisions 2 and 9), Not Started for orders without a selection. | **Done in code, uncommitted** (section 9) |
| 4 — Navigation and redirects | Orders primary in navigation; legacy `/menu-approvals` routes redirect to the order's approval tab; customer links untouched. | **Done in code, uncommitted** (section 10) |
| 5 — Cleanup | Remove obsolete internal pages and links only after the unified flow is verified **and AJ explicitly approves**. | **Done in code, uncommitted** (AJ approved 2026-10-16; section 11). Final verification pass still to run |

### Phase acceptance criteria and risks (Phases 2 to 5)

| Phase | Acceptance criteria | Regression risks | Tests required |
|---|---|---|---|
| 2 | Every action on `/menu-approvals/[id]` works from the order's Menu Approval tab with the same results (status, history, order sync, audit, Draft invoice, link). A user with `menus: approve` and without `orders: edit` opens the order read-only, can do the permitted approval actions and cannot change any other order field, in the UI **and** on the server. No cross-business or cross-location access. | **Two editors of one meal plan** on one page (the order form's planner on Guests & Menu Planning and the approval planner save through different paths: order form vs `updateMenuApprovalMealPlanAction`); must have one source of truth and no lost edits. `/orders/[id]` currently requires `orders: edit`, so the gate has to change without opening the editable form. Order form freezes for locked/completed orders (`isOrderLocked`, `freeze`). | Playwright: full send → customer approves → hand-off from the tab; read-only user (custom role) cannot edit and cannot be tricked by a direct action call; Vitest: permission matrix for each action with and without `orders: edit`; existing `menu-approvals`, `orders`, `order-locked` specs stay green. |
| 3 | Column and filters correct for all six approval statuses plus Not Started; Past view hidden by default and reachable, listing past-event orders whose menu is Needs Review, awaiting customer approval / customer reviewing, Changes Requested or Customer Approved and whose order is not Completed or Cancelled (Decision 9); default list unchanged. | `listOrders(when: "upcoming")` hides past orders everywhere today; the Past view must not leak past orders into the default view, the Dashboard, the Calendar or the customer's history. | Vitest for the list query and filters; Playwright for default vs Past. |
| 4 | Old `/menu-approvals` and `/menu-approvals/[id]` redirect to the right order and tab; bookmarks keep working; public `/menu-approval/[token]` unchanged. | Redirect of a selection id that has no order; role without access; route name `menu-approvals` is a reserved word (`lib/routing/reserved-words.ts`) and must stay reserved. | Playwright redirect cases; customer-link regression (`approval-responsive`, `approval-payment`, `menu-approvals` specs). |
| 5 | Nothing links to a removed page; AJ has approved the removal in writing. | Deleting code other flows import (the Order page's `recall-menu-button.tsx` imports `recallMenuAction` from `menu-approvals/actions.ts`); `src/lib/security/__tests__/location-guards.test.ts` lists `menu-approvals/actions.ts` and must be kept in step with any action moved or added. | Typecheck, lint, full Vitest and Playwright. |

---

## 6. Phase 1 scope (for AJ's review)

### 6.1 What Phase 1 is, and is not

Phase 1 only moves code: it extracts the parts of `menu-approval-review.tsx` into reusable components, makes the existing `/menu-approvals/[id]` page consume them, and changes no behaviour, no permission, no query, no server action and no markup the tests depend on. It does **not** touch the Order page, the Orders list, navigation, routes, the schema, the customer link or any business logic. Server actions in `menu-approvals/actions.ts` and modules in `src/modules/menu-approvals/` are reused as they are.

Reusable means: each part takes its data and callbacks as props, with no hidden reliance on being the whole page, so Phase 2 can place them inside an order's tab. The page header and breadcrumb stay page-specific (the Order page has its own).

### 6.2 Facts about the current component that the extraction must respect

- One client component owns all state: `entries`, `dirty`, `menuPreference`, `foodDialogTarget`, `pricePerPlate`, `noteDraft`, `historyOpen`, `compareOn`, `error`, `pending` (`save | approve | send | recall | price | note`), `sentUrl`. Send first saves a dirty plan, then sends.
- Pricing shown in the sidebar is computed live in the client with `priceMeals` (`meal-pricing.ts`), the same rule as the server.
- "Editable" statuses (`DRAFT`, `CHANGES_REQUESTED`) and "with customer" statuses are duplicated in the component from `EDITABLE_STATUSES` in `menu-approval.ts`, which is what enforces it on the server. Phase 1 keeps the comment and does not change either list.
- `menuPreference` is held in local state and is **not** included in the save payload (`planPayload`, `updateMenuApprovalMealPlanAction` take no preference). Observed, not verified against product intent; Phase 1 preserves it as is and reports it rather than fixing it.
- Version view is URL-driven (`?version=N`, `router.push(pathname?version=N)`); the component uses `usePathname`, so the extracted parts must not hard-code `/menu-approvals/...`. This is the one place an order context matters for Phase 2.
- Test hooks the Playwright specs rely on must survive: `data-testid` values `menu-approval-actions`, `venue-details-status`, `menu-notes-card`, `menu-note`, `menu-history-card`, `menu-version-summary`, `menu-version-row`, the anchor id `menu-notes`, and the button text used by `e2e/menu-approvals.spec.ts` ("Send Menu for Approval", "Approve & Send to Kitchen", "Compare with current"). The Order page's own `menu-status-banner` test id (`data-phase`) and its "Recall to edit" button are asserted by the same spec and by `orders.spec.ts`; they are on the Order page, which Phase 1 does not touch.
- `StatusPanel` (`orders/_components/status-panel.tsx`) is already shared with the Order page's `OrderStatusCard`; the page-level order status stays where it is.

### 6.3 Design system (RULES.md rule 6)

Artifact located and read: `https://claude.ai/artifact/242oXSUKGzzcMyGXqof4mh`, "Platterly Design System", version `1791827185-42d3` (readable; the relevant sections are marked Shipped). Phase 1 changes no visual output, so it must preserve, not extend, the following. Nothing here is Proposed.

| Pattern | Rule Phase 1 must preserve | Where it is in the current code |
|---|---|---|
| Cards | Ring card, `p-5` / `gap-4`, 40px primary-tint icon chip (10px radius) + 16px semibold title; summary card = chip + title, label/value rows, highlighted total | `Card` with `px-5 [--card-spacing:--spacing(5)]`, `SummaryCard`, `FormSection` (`orders/_components/order-form-parts.tsx`) |
| Status badges | One legend: neutral = not started, info = in progress, warning = needs attention, success = approved/done, danger = cancelled (plus the accent tones); menu approval tones come from `MENU_SELECTION_STATUS_TONE` | `Badge`, `order-status.ts` |
| Buttons | Default 44px; `size="md"` (38px) for card and inline actions, outline for secondary, text/link for "View All" | existing `Button` usages in the review component |
| Tabs | Underline tabs shared with the order form (used by Phase 2, not Phase 1) | `FormTabs` |
| Order page | Sidebar holds status, summary and menu approval only; menu approval card has version, status, send/recall, version history | `OrderStatusCard`, `OrderSummaryCard`, `OrderApprovalPanel` (Phase 2 reconciles) |
| Menu Planning | Meal cards, Individual Pricing switch, food-item drawer, Menu Preference cards: unchanged | `MenuPlanningSection` (reused untouched) |
| Read-only views | Read-only fields as a muted label over a value; locked states read as plain text, not disabled-looking inputs | planner `readOnly` prop |
| Copy / voice | Existing button and banner wording stays verbatim | |

Limitation: the artifact is a long HTML page; I read its section list and the Orders / Order page / Kitchen / Public Pages sections relevant here, not every section line by line. If Phase 2 introduces a new tab layout for approval, that goes through the design system first.

### 6.4 What was built (component boundaries as they now are)

Components live in `src/modules/menu-approvals/_components/review/` (Decision 5). No incompatibility was found: `src/modules` had no component files before, and its tests already import from `@/app/...`, so the folder works, and Next treats only `app/` as routes. Two layering notes, neither a blocker:

- The components import `FormSection`, `SummaryCard` and `StatusPanel` from `src/app/(app)/orders/_components/` (the same pieces the old review file imported), so a module folder now depends on an app folder. Moving those three to `src/components/` would remove it; not done, to keep Phase 1 to a move.
- To keep the components free of any server action, the actions are passed in (`ReviewActions` in `types.ts`); the only place that imports them is the page's own composition file.

| Piece | File | Takes | Replaces (in the old 816-line file) |
|---|---|---|---|
| Types | `review/types.ts` | none | `NoteView`, `VersionView`, the props interface; new `ReviewActions`, `ApprovalPending` |
| Helpers | `review/approval-format.ts` | none | `formatCurrency`, `formatDateTime`, `stageBanner`, `BANNER_CLASS`, `EDITABLE_STATUSES`, `WITH_CUSTOMER`, author labels |
| Controller hook | `review/use-approval-controller.ts` | data, `ReviewActions`, `ReviewNavigation` | the `useState` block, live pricing, `savePlan`, `handleSave/Send/Recall/Approve/SavePrice/AddNote` |
| `ApprovalActionBar` | `review/approval-action-bar.tsx` | status, flags, handlers, `children` slot | the `menu-approval-actions` button group; the page puts View Order in the slot |
| `ApprovalStageNotices` | `review/approval-stage-notices.tsx` | status, link, venue time, lock time | stage banner, customer-link bar with Copy link, venue status, lock note |
| `ApprovalVersionBar` | `review/approval-version-bar.tsx` | viewed version, compare flag, callbacks | the "Viewing Version N" bar and the no-dish-ids hint |
| `ApprovalMenuPlanner` | `review/approval-menu-planner.tsx` | entries, versions, menus, `loadPickerData` | the Menu Planning section: live planner, frozen version, Compare |
| `CustomMenuPriceCard` | `review/custom-menu-price-card.tsx` | price field, pending, `onSave` | "Quote the price per plate" |
| `ApprovalStatusCard` | `review/approval-status-card.tsx` | status, history, `onChange` | the `StatusPanel` usage |
| `ApprovalNotesCard` | `review/approval-notes-card.tsx` | notes, draft, pending, `onAdd` | the Notes card |
| `ApprovalHistoryCard`, `ApprovalVersionDialog` | `review/approval-history-card.tsx` | versions, status, callbacks | the Menu History card and its "View All" dialog |
| `ApprovalPricingCard` | `review/approval-pricing-card.tsx` | the computed amounts | the Pricing Details card |
| `loadMenuApprovalReviewData` | `src/modules/menu-approvals/review-data.ts` (server-only) | business id, an already-loaded and already-authorised selection, `viewVersion` | the ~100 lines of loading and mapping in `[id]/page.tsx` |
| `MenuApprovalReview` | `menu-approvals/[id]/_components/menu-approval-review.tsx` (230 lines, was 816) | the same props as before | now the page header, layout and the wiring of the actions; same export and props |
| `page.tsx` | `menu-approvals/[id]/page.tsx` (41 lines, was 160) | | keeps `requirePermission`, `getMenuSelection`, `assertKitchenAtMyLocation` and the `orders: edit` check for View Order, in the same order, then calls the loader |

Not extracted on purpose: the page header and breadcrumb (page-specific; the Order page has its own), and the Order status card.

### 6.5 Phase 1 status table

| Task | Existing components/files | Proposed change | Dependencies | Acceptance criteria | Tests required | Status |
|---|---|---|---|---|---|---|
| P1-01 Baseline before touching code | `e2e/menu-approvals.spec.ts`, `orders`, `order-locked`, `approval-responsive`, `approval-payment` | Ran the current suites; recorded results | Dev server, dev DB | Baseline recorded | Typecheck exit 0, lint exit 0 (no warnings); Vitest `src/modules/menu-approvals` + `src/lib/security`: 19 files, 277 tests passed; Playwright, the 5 specs above: 11 passed (1.7 min). `order-journey.spec.ts` (timed out in earlier sessions) was not run on the original code this session; it passed once after the refactor (38.8 s) | Done |
| P1-02 Close coverage gaps first (characterization) | No coverage existed for the Team note, custom-menu price quote, History "View All" popup, copy link, Recall on the review page, hand-made status | New `e2e/menu-approval-review.spec.ts` (one test, seven seeded states) and a seeding helper `seedReviewFixture` in `e2e/db.ts` | P1-01 | Passes on the unmodified page | Passed on the original code on four runs (once the spec's own mistakes were fixed), then on the refactored code on each run | Done |
| P1-03 Shared helpers | `formatCurrency`, `formatDateTime`, `stageBanner`, `BANNER_CLASS`, status groups | `review/approval-format.ts`, moved unchanged | none | Same output for every status | New `review-format.test.ts`: 7 tests (all six statuses, tones, the editable list equals the server's `EDITABLE_STATUSES`, formatting) | Done |
| P1-04 Controller hook | the state and handler block | `review/use-approval-controller.ts`; actions injected through `ReviewActions`, navigation through `ReviewNavigation` | P1-03 | No new server calls; same order (save plan, then send); same error text | New spec steps (send path is also in `menu-approvals.spec.ts` and `order-journey.spec.ts`) | Done |
| P1-05 Action bar | the `menu-approval-actions` block | `ApprovalActionBar` with a `children` slot for View Order | P1-04 | Same buttons, labels, disabled states, test id per status | New spec asserts the buttons for each of the seven states | Done |
| P1-06 Stage notices and copy link | banner, link bar, venue status, lock note | `ApprovalStageNotices` | P1-03 | Same text, tone and test id | New spec: link text and Copy link ("Copied!" and the clipboard value) in two places, venue status waiting/received, lock note | Done |
| P1-07 Version view, compare, planner | version memos, compare marks, the two planner usages | `ApprovalVersionBar`, `ApprovalMenuPlanner`; navigation is a callback, no hard-coded path | P1-04 | `?version=N` read-only view and Compare behave as before | New spec: View all, View version, Compare, Hide Compare, Back to current; existing Compare step in `menu-approvals.spec.ts` | Done |
| P1-08 Custom-menu pricing | the quote `FormSection` | `CustomMenuPriceCard` | P1-04 | Same validation text; price saved and reloaded | New spec: empty save error, price 250 shows "= ₹25,000.00 for 100 guests", saved value survives a reload | Done |
| P1-09 Status card | `StatusPanel` usage | `ApprovalStatusCard` | none | Same options, hint, reason rule | New spec: short reason refused, valid reason moves selection to Customer Approved and the order to Approved (read from the database), history shows Manual and the reason | Done |
| P1-10 Notes and history cards | Notes card, Menu History card and dialog | `ApprovalNotesCard`, `ApprovalHistoryCard`, `ApprovalVersionDialog` | P1-04 | Same markup, newest note first, "View All" only past two versions | New spec: add a note (button disabled when empty, note appears, box clears, count), customer and kitchen notes, two summaries plus three rows in the dialog | Done |
| P1-11 Pricing card | Pricing Details | `ApprovalPricingCard` | P1-04 | Same figures and "since the last version" line | Identical HTML in all states (see P1-14) | Done |
| P1-12 Server data loader | `[id]/page.tsx` loading and mapping | `loadMenuApprovalReviewData`; permission and location checks stay in the page, before the loader | none | Same data; another business's selection yields nothing | New `review-data.test.ts`: 4 tests on the real database (own data, sent version with link and notes, no order, cross-business). A mutation check (the loader reading with the selection's own business id) makes the cross-business test fail | Done |
| P1-13 Compose | `menu-approval-review.tsx` | Composition of the pieces; same export and props | P1-03 to P1-12 | Composition only; no change under `actions.ts`, `src/modules/menu-approvals/*.ts` business logic, schema, routes | `git diff` shows only the two app files, new files and `e2e/db.ts` | Done |
| P1-14 Regression pass and compare | n/a | Re-ran the suites; compared the page against the baseline | P1-13 | Related specs pass; page identical | Typecheck clean; lint clean; `check:migrations` passed; full Vitest 150 files, 1461 tests passed; Playwright `menu-approvals`, `orders`, `order-locked`, `approval-responsive`, `approval-payment`, `menu-approval-review`: 12 passed (1.7 min); `order-journey`: 1 passed. **Compare:** the page's HTML (ids, dates, tokens, email masked) for 9 states at desktop, tablet and phone width was byte-identical before and after (27 files, two baseline runs also identical). Screenshots were taken for each, but two runs of the *same* code are not pixel-identical (the planner's height varies by a few lines between runs) and no image-diff tool is installed, so screenshots were spot-checked by eye rather than compared pixel by pixel | Done |
| P1-15 Documentation | this file, `src/modules/menu-approvals/README.md`, `.claude` status files | Record what moved where | P1-14 | Doc matches the code | n/a | Done |

### 6.6 Phase 1 acceptance (from AJ's brief)

| Criterion | Where it stands |
|---|---|
| The merge plan is saved in the repository | Done: this file |
| All four decisions documented as approved | Done: section 3 |
| Phase 1 status table complete and based on actual code | Done: 6.2 to 6.5 |
| Reusable component boundaries identified | Done: 6.4 |
| Existing Menu Approvals behaviour can remain unchanged | Verified: identical HTML in 27 page states, 12 Playwright and 1461 Vitest tests passing |
| Permissions, customer links, version history and hand-off preserved | Verified: `actions.ts`, the business-logic modules, routes and the public link are untouched; the page's checks run in the same order before the loader; hand-off and version history are in the specs |
| Tests and acceptance criteria specified | Done: 6.5 |
| Legacy cleanup documented as a separate, unapproved task | Done: section 7 |

---

## 7. Legacy development data (Decision 4): findings only

Read-only query: `scripts/report-approval-order-mismatch.sql` (sets the session read-only; selects only). Result on the development database: **27 rows = 8 `MISMATCH` + 19 `NO_SELECTION`**, matching the audit. The full list, with recommended handling per group, is in `docs/menu-approvals-orders-merge-legacy-data-report.md`.

Nothing was modified, deleted, repaired or migrated. **Cleanup is a separate task that is not approved**; it needs AJ to review the report and approve a specific action per group.

Known limitations that remain after Phase 1:

| Limitation | Effect |
|---|---|
| 19 development orders have no menu selection | Phase 3 shows them as Not Started; Phase 2 sending a menu creates the selection if the order has an Event Type (`ensureOrderMenuSelection`). One order has no Event Type and cannot start an approval until one is set. |
| 8 orders disagree with their menu selection | They would show an Order Status and a Menu Approval Status that contradict each other in the new views. Only the dev database is affected as far as checked. Production has no data yet. |
| `order-journey.spec.ts` timed out at the kitchen-member invitation step in earlier sessions | Passed once after the Phase 1 refactor (38.8 s); the earlier timeout was never investigated, so treat it as intermittent, not fixed. |
| No browser test of the kitchen stage screens | Noted in the Phase 0 follow-ups. |
| `menuPreference` is not saved by the approval page's Save | See 6.2. |

---

## 8. Phase 2 scope: Menu Approval tab in Order Details (for AJ's review; not started)

Everything here was read in the code on `main` plus the uncommitted Phase 1 work. Nothing in this section is built. No schema change is needed anywhere in it.

### 8.1 What the code does today (findings that shape the scope)

| # | Finding | Where | Why it matters |
|---|---|---|---|
| F1 | The Order page is one `<form>`: header, the tab strip (`FormTabs`, every panel stays mounted but hidden) and the sidebar are all inside it, so Enter in any text input submits the whole order. The Inventory tab already stops this with an `onKeyDown` wrapper. `FormTabs` keeps the active tab in local state, so a tab cannot be opened by URL. | `orders/_components/order-form.tsx`, `form-tabs.tsx` | The review's price field and note box would sit inside that form; the tab needs the same Enter guard, and `?tab=approval` support is needed for Phase 4's redirects. |
| F2 | `/orders/[id]` requires `orders: edit` for the page itself, and then loads a long list (customers, payments, invoice, expenses, staffing, inventory...). Every order-changing action in `orders/actions.ts` is guarded by `orders: edit`, `create` or `delete`. | `orders/[id]/page.tsx`, `orders/actions.ts` | An approval-only user must not trigger those loads, and the order-save actions already refuse them on a direct call. |
| F3 | Two planners end in the same save. The order form's planner (Guests & Menu Planning tab) saves through `saveOrderWithMeals`, the review's planner through `updateMenuApprovalMealPlan`; both finish in `updateMenuApprovalMealPlan`. Each keeps its own unsaved client draft. | `order-form.tsx`, `menu-approval.ts` | On one page the two drafts would silently overwrite each other (last save wins). |
| F4 | **Price is not frozen after approval.** `updateOrder` refuses a change only when the order is Sent to Kitchen or Completed (`isOrderLocked`). While the menu is with the customer or approved (Order status Awaiting Customer Approval or Approved), a person with `orders: edit` can still change guests, children's rates, discount, transport, other and custom charges, Individual Pricing, and the order total follows. Also, `saveOrderWithMeals` saves the order fields first and only then runs the meal-plan save, which refuses a non-editable menu, so a refused save can still leave the order fields changed. | `order.ts` `updateOrder`, `order-lock.ts`, `menu-approval.ts` `saveOrderWithMeals` | Decision 10 is not met today on the `orders: edit` path. |
| F5 | **`setCustomMenuPricePerPlate` has no stage check**, runs as several separate writes (selection, each meal, then totals) with no lock, and audits only the new price (`after`), not the old one. Guard today: `menus: approve` and the location check. | `menu-approval.ts`, `menu-approvals/actions.ts` | Decisions 8 and 10 apply here directly. |
| F6 | Sending does not require a Custom Menu to be quoted: `sendMenuForApproval` never reads `customPricePerPlate`. | `approval-link.ts` | An approval-only user could send an unpriced custom menu if they cannot quote it. Open question (8.8). |
| F7 | The Order page already shows a compact approval: `MenuStatusBanner` above the planner (with Recall to edit) and `OrderApprovalPanel` in the sidebar (two versions, venue status, "Open in Menu Approvals" link to the old page). | `orders/[id]/_components/` | Phase 2 retargets these to the tab and keeps them as the summary. |
| F8 | `addMenuApprovalNoteAction` has no completed-order check, although a completed order is meant to be closed. Minor. | `menu-approvals/actions.ts` | Noted for AJ; not changed unless AJ asks. |
| F9 | `/orders` and its nav entry need `orders: view` (`nav-permissions.ts`). An approval-only user without it has no way into an order except the Menu Approvals queue. | `nav-permissions.ts` | The old queue must stay until Phase 4 gives them another entry; the read-only order view itself is reached by URL or from the queue. |

### 8.2 The Menu Approval tab

- **Where:** a new tab "Menu Approval" in the order's tab strip, after "Guests & Menu Planning". It is a new slot on `OrderForm` (like `inventoryTab`), filled by a new server-fed client wrapper `orders/[id]/_components/order-menu-approval-tab.tsx` that renders the Phase 1 components. It opens by URL: `FormTabs` gains an optional `initialTab`, and the page passes it from `?tab=` after checking it against the tabs that exist. Version view uses the existing navigation callback: `?tab=approval&version=N`, back to `?tab=approval`.
- **Data loading:** the order page's server component calls `loadMenuApprovalReviewData(organizationId, selection, { viewVersion })` (Phase 1) once, after the permission, business and location checks, only for a viewer who may see the approval (8.3), and only when a selection exists. It reads again what `getOrder` already read (one extra order read); that is accepted to keep the loader the single source. It does not load for orders with no selection.
- **Actions:** the same eight `ReviewActions` as `/menu-approvals/[id]`, imported in one composition file next to the tab, so the permission and stage rules are exactly the server's. One new action: `startMenuApprovalAction` (8.5).
- **Capabilities, not new rules.** The review components get a small capabilities object from the server (`canAct`: stage buttons, notes, planner, manual status; `canQuotePrice`). It only hides controls; every action still checks on the server. `/menu-approvals/[id]` passes `canAct: true` (it already requires `menus: approve`) and `canQuotePrice` from the new price guard, so its price card follows Decision 8 as well.
- **One planner (needs AJ's call, 8.8):** when a menu selection exists, the order form's own planner on the Guests & Menu Planning tab becomes read-only with a pointer to the Menu Approval tab, and the approval tab owns editing. Before a selection exists, the order form's planner stays editable (the team needs it to set the first meals).
- **Enter and unsaved changes:** the tab gets the Inventory tab's Enter guard. The review keeps its own Save and its own "Unsaved changes" line; switching tabs does not discard either draft because panels stay mounted.
- **Duplicates kept small:** `MenuStatusBanner` and the sidebar `OrderApprovalPanel` stay as summaries; their "Open Menu Approvals" links become "Open the Menu Approval tab" (`?tab=approval`).

### 8.3 Who sees what, and how approval-only access works without order editing

| Viewer | Order page | Menu Approval tab |
|---|---|---|
| `orders: edit` and `menus: approve` (owner, sales & event team) | The editable page as today | Full: every approval action; price quote also allowed (8.7) |
| `menus: approve` only (Decision 6) | **Restricted read-only view** (below), no order form at all | Full approval actions except the price quote; planner editable only in Needs Review / Changes Requested (Decision 7, already enforced by the server) |
| `orders: edit` only | The editable page as today | **Proposal:** read-only (no buttons, no planner edit, no notes box, no manual status), because they cannot act on approvals today either. Open (8.8). |
| Neither | 403, as today | n/a |

How approval-only access is kept separate from order editing:

1. The page asks two questions with `hasPermission` and still resolves the business with `requireActiveOrganization`. `orders: edit` → today's page. Else `menus: approve` → the restricted view. Else `forbidden()`. Both modes call `assertOrderAtMyLocation` (a held member gets a 404 outside their location) and read through `organizationId`-scoped queries.
2. The restricted view is its own server component, **not** the order form with disabled fields. It never mounts `OrderForm` or imports an order-save action, and it does not run the loads for payments, invoices, expenses, staffing, inventory, customers or Razorpay/UPI settings. So there is no order-edit control to press and nothing extra to leak.
3. Its data is limited to what an approver can already see on `/menu-approvals/[id]`, plus the order summary: header (order number, customer name, event type, date, guests, kitchen), the summary card (customer name, type, event type, dates, venue, guest counts), the Menu Approval content, and the order's status history read-only. It does **not** include customer phone or email, notes or kitchen notes, pricing editor values beyond the approval's Pricing Details card, payments, expenses, staffing or inventory. Only these fields are passed to client components, so they are all that reaches the browser.
4. The order's own manual status control (`changeOrderStatusAction`) needs `orders: edit` and is not rendered for them. The menu-level manual status (`menus: approve`) stays in the approval tab as today.
5. Every action reachable from the tab is the same `menus: approve` action with the same location check; none of the order actions is reachable. A forged call to `updateOrderAction` by an approval-only user is refused by its own `requirePermission` (F2).

### 8.4 Action map: permission and permitted stage

"Stages" are menu approval statuses. "Server today" is what is enforced now; "Phase 2" is what changes.

| Action (file) | Permission today | Stage rule enforced on the server today | Phase 2 |
|---|---|---|---|
| Save planner: `updateMenuApprovalMealPlanAction` | `menus: approve` + location | Needs Review, Changes Requested only | No change (meets Decision 7) |
| Send / Send Updated: `sendMenuForApprovalAction` | `menus: approve` + location | Needs Review, Changes Requested only | No change. Open: require a quote for a Custom Menu (F6) |
| Recall to Edit: `recallMenuAction` | `menus: approve` + location | Awaiting Customer Approval, Customer Reviewing, Customer Approved → Needs Review | No change. This is the revision path for Decision 10 |
| Approve & Send to Kitchen: `approveAndSendToKitchenAction` | `menus: approve` + location | Customer Approved only; atomic with the Draft invoice | No change |
| Manual menu status: `changeMenuStatusAction` | `menus: approve` + location | Any to any, reason of 5+ characters, refused on a Completed order | No change |
| Add note: `addMenuApprovalNoteAction` | `menus: approve` + location | None | No change (F8 noted) |
| Load food picker: `getMenuForApprovalPickerAction` | `menus: approve` | n/a | No change |
| **Quote custom price: `setCustomMenuPriceAction`** | `menus: approve` + location | None (F5) | **`menus: approve` and `orders: edit`; Needs Review / Changes Requested only; one transaction under the menu's lock; audit with before and after (8.7)** |
| **Save order: `updateOrderAction`, `updateOrderAndNotifyAction`** | `orders: edit` + location | Not when Sent to Kitchen / Completed | **Also refuse any price-affecting change unless the menu is in Needs Review / Changes Requested or the order has no menu selection (8.6)** |
| **Start menu approval: `startMenuApprovalAction` (new)** | `menus: approve` + location | Order has an Event Type; order not Completed or Cancelled; no selection yet (repeat calls return the existing one) | New; calls the existing race-safe `ensureOrderMenuSelection` |
| Order status by hand: `changeOrderStatusAction` | `orders: edit` + location | Not on a Completed order | No change; not shown to approval-only users |

### 8.5 Orders with no menu selection, past events, completed and cancelled

| Case | What the tab and the order page do |
|---|---|
| No selection, has an Event Type (all 19 legacy rows: 18 already have an Event, 1 has the Event Type but no Event yet) | The tab says "Menu approval not started" and offers **Start menu approval** (the new action; for the order with no Event yet it creates the Event as `ensureOrderMenuSelection` already does), then the normal review opens in Needs Review. Nothing is created until someone clicks. |
| No selection, no Event Type (none in the legacy data, but possible for a new order) | "Menu approval needs an Event Type on the order." For an `orders: edit` user a link to the Order Details tab; for an approval-only user the message only, since they cannot edit it. No start button without an Event Type. |
| Past event, approval outstanding (Decision 9 stages) | Fully usable, same as any order: the page has no date restriction today and the approval actions have none. Phase 2 changes nothing; the Past list is Phase 3. |
| Past event, nothing outstanding | Opens read-only like any Sent to Kitchen order. |
| Sent to Kitchen | Order form locked as today; tab read-only with the lock note and venue status; no stage buttons (the menu is FINAL_LOCKED). Revising needs a manual status change with a reason (the existing way back), then Recall, edit, send and re-approval. |
| Completed | Everything read-only; manual menu status disabled (`orderCompleted`); Start hidden. |
| Cancelled (order status) with a selection | The selection is FINAL_LOCKED with kitchen stage Cancelled, so there are no stage buttons; read-only. |
| Cancelled with no selection | "This order is cancelled": no Start. |

### 8.6 Decision 10 enforcement: no price change after approval

The rule: while a menu is Awaiting Customer Approval, Customer Reviewing, Customer Approved or Approved & Sent to Kitchen, nothing that changes what the customer is being charged may change. The deliberate revision is the existing one: **Recall to Edit** (back to Needs Review, old versions marked Replaced, old links dead), edit, **Send Updated Menu**, customer approves the new version, hand-off again. After the hand-off there is no Recall, so the way back is the manual status change with a reason.

- **Where:** a server check inside `updateOrder`, at the start and under the menu's row lock in the same transaction as the write, so a customer approving at the same moment cannot slip a price change through (the pattern Phase 0 used). It runs before any field is written, which also fixes the partial save in F4.
- **Price-affecting fields** (read from what `updateOrder` writes): adult, under-5 and 5-to-10 guest counts and total participants; pricing method; the individual under-5 and 5-to-10 rates and their types; Individual Pricing on/off; discount; transportation cost; other charges; the custom charge lines; and the meal plan (already refused by the existing path). Date, venue, notes, customer and other details are not price fields and stay as they are.
- **How it decides:** it compares what is being saved with what is stored and refuses only an actual difference, so saving an unchanged order (the form always submits every field) keeps working. The message: "The price can't change while the menu is with the customer or approved. Recall the menu to edit it; the customer will approve the new version."
- **UI mirror:** the order form freezes the guest and pricing controls in those stages, like the planner already freezes. The server rule is the one that counts.
- **No selection:** the rule does not apply (nothing has been shown to a customer).
- **Effect on current users, to confirm:** this tightens what `orders: edit` users can do today in the Awaiting and Approved stages. It is what Decision 10 asks for, but it is a visible change, so it is listed in the risks.

### 8.7 Custom-menu pricing guard (Decision 8) and audit

The permission model has no pricing permission: price on an order is governed by `orders: edit` (the order's pricing editor and every save), while `menus: approve` governs the approval workflow. A quote sets the order's menu amount (it writes the price on the meals and recalculates the totals), so it is an order-price change.

**Recommendation:** `setCustomMenuPriceAction` requires `menus: approve` **and** `orders: edit`, plus the location check. No new permission, role or schema is introduced, and an approval-only user gains nothing. Both built-in roles that hold `menus: approve` (owner, sales & event team) also hold `orders: edit`, so no built-in role loses the quote. A business that customised a role to have `menus: approve` without `orders: edit` loses it, which is the point of Decision 8; the UI hides the price card for them and the server refuses a direct call. Alternatives considered: `menus: edit` (kitchen's permission, wrong team), or a new `pricing` permission (a model change, not asked for).

- **Stage:** Needs Review and Changes Requested only (Decision 10), re-read after taking the menu's row lock, in one transaction with the meal updates and the total recalculation (today these are separate writes).
- **Audit:** the existing entry `menu_selection.custom_price_set` gains a `before` (previous price per plate, order total) and `after` (new price, order total, guests, meals priced). The audit log already stores `before` and `after` as free-form data, so **no schema change** is needed. No other field is required.
- **Pre-existing flaw kept out of scope:** sending does not need a quote (F6). Whether to block Send until a Custom Menu is quoted is a workflow decision for AJ (8.8).

### 8.8 Decisions needed from AJ before building

| # | Question | Recommendation |
|---|---|---|
| Q1 | One planner: make the order form's planner read-only once a menu selection exists, with the approval tab as the only place to edit it (this changes the 2026-10-10 "both ways, one planner" behaviour, and the e2e step in `menu-approvals.spec.ts` that edits on the order page) | Yes. It removes the two-drafts problem (F3). Fallback: keep both and refuse a save when the other has unsaved changes (more code, still confusing). |
| Q2 | Should an `orders: edit` user without `menus: approve` see the approval tab read-only? | Yes, read-only. |
| Q3 | Block Send for a Custom Menu until it has been quoted? | Yes: refuse with "Quote the price per plate first." It stops an approval-only user, who cannot quote, from sending an unpriced menu. Needs AJ's yes because it changes the current flow. |
| Q4 | The Decision 10 tightening of the `orders: edit` save path (8.6) changes what those users can do in the Awaiting and Approved stages. Confirm. | Confirm; it is what Decision 10 asks for. |
| Q5 | Notes on a Completed order (F8)? | Refuse, to match "a completed order is closed". Small, can ride with Phase 2 if AJ agrees. |

### 8.9 Not in Phase 2

The Orders list columns and filters and the Past view (Phase 3); sidebar and navigation changes, redirects from `/menu-approvals`, and how an approval-only user without `orders: view` reaches orders from the menu (Phase 4; the queue stays until then, F9); removing any page (Phase 5). The public customer link and its token behaviour are not touched.

### 8.10 Phase 2 status table

Built and verified (statuses below); evidence and deviations in 8.13. Uncommitted.

| Task | Files | Acceptance criteria | Tests | Dependencies | Status |
|---|---|---|---|---|---|
| P2-01 Baseline and characterization | `e2e/orders.spec.ts`, `menu-approvals.spec.ts`, `order-locked.spec.ts`, new `e2e/order-approval-baseline.spec.ts` | Record current results; pin what the order page shows per approval stage (banner phase, Recall to edit, sidebar panel, price fields editable or not in Awaiting and Approved, to show F4 before it changes) | Run the suites; new spec passes on today's code | Dev server, dev DB | Done |
| P2-02 Price freeze on the order save path (F4, Decision 10) | `src/modules/orders/order.ts` (`updateOrder`), `src/modules/menu-approvals/menu-approval.ts` (`saveOrderWithMeals`), a small pure helper for "is this save a price change" | In the four non-editable stages a price-affecting difference is refused with nothing written; an unchanged re-save works; Needs Review, Changes Requested and no-selection orders unchanged; a customer approving at the same moment cannot slip a change through; a refused meal-plan save leaves the order fields untouched | New Vitest: each field changed in each stage (table-driven); unchanged save passes; two simultaneous requests (approve vs price change) leave a consistent result, using the Phase 0 race-test pattern; existing `order` and `approval-concurrency` suites stay green | P2-01, AJ's Q4 | Done |
| P2-03 Custom-price guard (Decisions 8 and 10) | `menu-approval.ts` (`setCustomMenuPricePerPlate`), `menu-approvals/actions.ts` (`setCustomMenuPriceAction`) | Needs `menus: approve` and `orders: edit` and the location check; refused outside Needs Review / Changes Requested; one transaction under the lock; audit has before and after; no schema change | New Vitest with the real permission checks (the `recipe-status-permission.test.ts` pattern, using `saveRoleGrants` to build an approve-only role): allowed with both, refused with approve only, refused in each non-editable stage, concurrent quote vs send leaves the price as the winner of the lock; audit fields asserted; `location-guards.test.ts` stays green | none | Done |
| P2-04 Start menu approval action | `menu-approvals/actions.ts` (new `startMenuApprovalAction`), `location-guards.test.ts` entry if needed | `menus: approve` + location; needs an Event Type; refused on Completed or Cancelled; creating twice returns the same selection; no Event Type returns a clear message | Vitest: permission, location, no Event Type, repeat call, completed and cancelled orders; static `location-guards` check passes | none | Done |
| P2-05 Review capabilities | `_components/review/types.ts`, `approval-action-bar.tsx`, `approval-notes-card.tsx`, `custom-menu-price-card.tsx`, `approval-status-card.tsx`, `approval-menu-planner.tsx`, `use-approval-controller.ts` | With `canAct` false there are no stage buttons, no notes box, no manual status, planner read-only; `canQuotePrice` false hides the price card (shows the quoted price as text); `/menu-approvals/[id]` with full rights renders the same HTML as after Phase 1 except for the price card of a user without `orders: edit` | The Phase 1 `menu-approval-review.spec.ts` snapshot compare (identical for the full-rights owner); new snapshot states for read-only | P2-03 | Done |
| P2-06 Tabs by URL and version navigation | `orders/_components/form-tabs.tsx`, `order-form.tsx`, `orders/[id]/page.tsx` | `?tab=approval` opens the tab; an unknown tab falls back to the first; `?tab=approval&version=N` shows the frozen version and keeps the tab; unsaved order edits survive a version switch | Playwright: deep link, bad value, version switch with an unsaved order field | none | Done |
| P2-07 Menu Approval tab | new `orders/[id]/_components/order-menu-approval-tab.tsx`, `orders/[id]/page.tsx`, `order-form.tsx` (new slot), `edit-order-client.tsx` | The tab renders the Phase 1 components with the order's data; Enter in the price or note field does not submit the order; every action works from the tab with the same result as on the old page (status, history, order sync, audit, Draft invoice, links) | Playwright: send, customer requests changes (public link, separate context), send updated (v1 link dead, v2 live), version history and Compare in the tab, recall from sent and from approved, customer approves, Approve & Send to Kitchen creates the Draft invoice and the Kitchen Dashboard shows it, copy link | P2-05, P2-06 | Done |
| P2-08 Orders with no selection, past, completed, cancelled | the tab, `startMenuApprovalAction` wiring | Each row of 8.5 behaves as written | Playwright seeds (`seedReviewFixture` plus order-status helpers): not started with and without an Event Type, past with outstanding approval, completed, cancelled, sent to kitchen | P2-04, P2-07 | Done |
| P2-09 One planner and price freeze in the order form (Q1, Decision 10 UI) | `order-form.tsx` (planner read-only with pointer when a selection exists; guest and pricing controls frozen in the non-editable stages) | Order form shows the pointer and read-only planner when a selection exists; guests and pricing fields are read-only in the four stages and editable in Needs Review / Changes Requested; the order-form edit steps in `menu-approvals.spec.ts` are updated to edit through the tab | Updated `menu-approvals.spec.ts` and `orders.spec.ts`; `order-locked.spec.ts` | Q1, P2-02 | Done |
| P2-10 Restricted read-only order view (Decisions 6 and 7) | `orders/[id]/page.tsx` (mode check), new `orders/[id]/_components/approval-only-order-view.tsx`, `order-status-card.tsx` (no manual change for this view), `order-summary-card.tsx` reused | Approval-only user opens the order: no order form, no pricing/payment/expense/staff/inventory loads, no customer phone or email, notes or kitchen notes in the HTML; tab works; planner editable only in the two stages; a direct call to `updateOrderAction` is refused | Vitest permission matrix over the page's mode choice and over each action for four roles (both, approve-only, edit-only, neither) built with `saveRoleGrants`; Playwright: approval-only user (custom role) opens an order, sees no order form, edits the planner in Needs Review but not in Awaiting; the page HTML does not contain the customer's phone | P2-03, P2-05, P2-07 | Done |
| P2-11 Edit-only read-only tab (Q2) | the tab | `orders: edit` without `menus: approve` sees the approval read-only; no action reachable | Playwright and the Vitest matrix | Q2, P2-10 | Done |
| P2-12 Location and business isolation | the page, the tab, the new action | A held member gets 404 for another location's order on the page and for every action by id; another business's order is not found; approval-only included | Vitest (the `actions-guard` / `scoped-views` patterns for actions and `location-guards.test.ts`), Playwright with `holdMemberToLocation` and `assignOrderEventToLocation` for the page | P2-10 | Done |
| P2-13 Sidebar and banner links | `menu-status-banner.tsx`, `order-approval-panel.tsx` | Links open the tab; copy and the existing test ids (`menu-status-banner` with `data-phase`, `order-approval-panel`) unchanged | `menu-approvals.spec.ts`, `orders.spec.ts` | P2-06 | Done |
| P2-14 Notes on completed orders, Send needs a quote (Q3, Q5) | `menu-approvals/actions.ts`, `approval-link.ts` | Only if AJ says yes: a completed order refuses new notes; a Custom Menu cannot be sent unquoted | Vitest for each | Q3, Q5 | Done |
| P2-15 Regression pass | all of the above | Typecheck, lint, `check:migrations`; full Vitest; Playwright `menu-approvals`, `menu-approval-review`, `orders`, `order-locked`, `order-journey`, `approval-responsive`, `approval-payment`, the new specs; the Phase 1 snapshot compare for `/menu-approvals/[id]`; the customer link spec shows the public page and token behaviour unchanged | the runs | all | Done |
| P2-16 Documentation | this file, `src/modules/menu-approvals/README.md`, `.claude` files, design system artifact if the tab or the restricted view adds a pattern | Doc matches the code; any new pattern goes into the design system before it is built | n/a | P2-15 | Done |

### 8.11 Test plan summary

| Area | What is proved | How |
|---|---|---|
| Permissions | Both, approve-only, edit-only and neither: page mode and each action; approval-only cannot reach any order-save action; price quote needs both permissions | Vitest with the real checks and `saveRoleGrants` (no stubbing of permissions); Playwright with a custom-role user |
| Location isolation | Held member: 404 on the page and on each action by id; no cross-business reads | Vitest, `location-guards.test.ts` for new actions, Playwright |
| Stage rules | Planner and price only in Needs Review / Changes Requested; frozen in the other four; unchanged save still works; races | Table-driven Vitest; real simultaneous requests |
| Customer links | The public URL and token behaviour are unchanged: v1 link dead after Send Updated, link dead after Recall, link live after approval, venue form and confirmation work | Playwright with a cookie-less context; the existing `approval-responsive` and `approval-payment` specs |
| Version history, recall, resend, approval, hand-off | Same results from the tab as from the old page | Playwright, plus the status and invoice read from the database |
| Restricted view | No order form, no extra loads, no private fields in the page output | Playwright content check; code review of the loads |
| No regression | `/menu-approvals/[id]` identical for a full-rights user | Phase 1 snapshot compare |

### 8.12 Risks

| Risk | Handling |
|---|---|
| The Order page is one large form; a tab inside it shares Enter, dirty tracking and the leave-page guard | Enter guard as in Inventory; the review keeps its own draft; test unsaved edits across tab and version switches |
| Q1 changes behaviour AJ asked for on 2026-10-10 | Explicit decision (Q1); the e2e steps that edit on the order page are updated, not deleted |
| The price freeze (8.6) changes what `orders: edit` users can do in two stages | Explicit confirmation (Q4); clear refusal message that names the way forward; unchanged re-saves still work |
| Restricted view leaks a field through props | Pass only the listed fields; assert on the rendered page |
| Quote guard removes the quote from a customised role | Intended by Decision 8; UI shows the quoted price as text; recorded here |
| Two loads of the order (page and loader) | Accepted for one source of truth; revisit only if slow |
| Start action and Send race | `ensureOrderMenuSelection` is already race-safe (Phase 0, `first-send-and-kitchen-concurrency.test.ts`) |

### 8.13 Phase 2: what was built, evidence, deviations and open risks

**Built** (decisions 11 to 15; no schema change, no new permission, no migration):

| Area | Change |
|---|---|
| Tab and restricted view | `orders/[id]/_components/order-menu-approval-tab.tsx`, `approval-only-order-view.tsx`, `page.tsx` (mode check, review data, `?tab=` and `?version=`), `order-form.tsx` (tab slot, read-only planner that shows the saved plan, frozen guest and pricing sections, Enter guard), `form-tabs.tsx` (`activeId`), `edit-order-client.tsx`, banner and sidebar links, `order-status-card.tsx` (`canChange`) |
| Review components | `ApprovalReviewBody` (shared by `/menu-approvals/[id]` and the tab), `capabilities` (`canAct`, `canQuotePrice`) on the props, price card with a read-only variant and a "can't be sent until quoted" line, notes box and planner follow `canAct` |
| Server rules | `orders/price-freeze.ts`, `updateOrderInTransaction` and `lockOrderSelections` in `orders/order.ts` (the whole order save is one transaction under the menu lock); `saveOrderWithMeals` and `updateMenuApprovalMealPlan` atomic and under the lock; `setCustomMenuPricePerPlate` transactional, stage-limited, audited before and after; Send refused for an unquoted custom menu (`approval-link.ts`); forward manual status moves refused while the price differs from the version the customer saw (`manual-status.ts`); notes refused on a Completed order; `startMenuApprovalAction`; shared `approval-stages.ts` and `lib/after-commit.ts` |
| Pure rules | `page-access.ts` |

**Evidence** (local, dev database):

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run check:migrations` | all exit 0, lint with no warnings |
| Full Vitest | 154 files, 1523 tests passed (new: `price-freeze` 34, `custom-price-and-reapproval` 9, `phase2-actions` 12, `page-access` 7; the existing `location-guards.test.ts` passes with the new action) |
| Mutation checks | with the price-freeze check disabled 6 of the new tests fail; with the order save made non-atomic 2 fail (they time out on the lock) |
| Playwright, new `order-approval-tab.spec.ts` | 4 passed: tab by address, send, customer link, request changes, resend (v1 link dead), version view and Compare in the tab, Recall, approve, hand-off with its Draft invoice, price frozen in the form and an unchanged save still works, not-started / no Event Type / Completed / Cancelled, approval-only restricted view (no order form, no customer phone in the page, quote not offered, Send blocked for an unquoted custom menu), edit-only read-only tab, 403 for neither |
| Playwright, updated specs | `menu-approvals.spec.ts` (the "both ways, one planner" step now edits in the tab and checks the read-only planner follows), `orders.spec.ts`, `quotations.spec.ts`: scoped to `#order-panel-menu` because the tab holds its own planner copy |
| Phase 1 snapshot compare of `/menu-approvals/[id]` | identical HTML in 24 of the 27 files (8 states, 3 widths); the other 3 (the unquoted custom menu) differ only by the new line "This menu can't be sent to the customer until a price is saved." |
| Full Playwright suite (13.4 min) | 107 passed, 5 failed. Three pass when run alone (`dashboard-layout`, `kitchenlogin`, `orders.spec.ts:550`: load flakes, the last an e2e sign-up collision already in `ISSUE-LOG.md`). Two fail the same way on a clean checkout of `6525313` (`purchase-order-pdf`, `recipes-page`), so they are not caused by Phase 2 and were not touched |

**Deviations from the plan, and things found while building:**

| # | What | Why |
|---|---|---|
| D1 | The price freeze initially refused an unchanged save of a real form. The form always sends the children's pricing types ("FIXED"), where the stored value can be empty. Rates and types now count as price fields only under Individual children's pricing, and an empty stored type reads as FIXED. | Found by the e2e check "an unchanged save still works" before it shipped |
| D2 | `updateOrder` as a whole is now one transaction for every caller, not only the order-form path | Needed to make "the stage check and the write under the same lock" true everywhere |
| D3 | Q4's post-hand-off rule is enforced as: a forward manual status move (to Customer Approved or the kitchen) is refused while the price differs from the version the customer last saw. It is not a new "recall from the kitchen" workflow. Moving back by hand with a reason (the existing way back) is still allowed | The brief asked that a manual status change alone can't stand in for re-approval; adding a kitchen recall would be a new workflow |
| D4 | The quote guard needs `orders: edit` as well as `menus: approve`, as recommended in 8.7. A business that customised a role to approve without editing orders loses the quote for that role | Decision 8 |
| D5 | The order form's planner is read-only whenever the order has a menu approval, including Needs Review | Decision 11 |

**Open risks and limits:**

| Risk | Note |
|---|---|
| After the kitchen has started cooking, a manual move back (with a reason) is still possible | **Resolved in 8.14**: refused once the kitchen has started. |
| The customer's own link can still add a note to a Completed order | **Resolved in 8.14**: refused (and Cancelled) on the server. |
| The approval tab's planner draft has no leave-page warning (as on the old page) | Not added to avoid two warnings fighting on one page. |
| `?tab=` is read on load and from links; clicking a tab does not change the address | Phase 4 redirects only need the load behaviour. |
| A held member's page-level 404 for another location's order relies on the unchanged `assertOrderAtMyLocation` check, covered here at the action level and by the existing location tests, not by a new browser test | |
| The page reads the order twice (page and review loader) | Accepted for one source of truth. |
| An approval-only user without `orders: view` reaches an order from the Menu Approvals queue; the queue and `/menu-approvals/[id]` stay until Phase 4 | Plan 8.9 |
| Existing orders whose `totalParticipants` is not adults plus children could read as a guest-count change when the form re-submits them | Not seen in the dev data; would show as a clear refusal, not corruption. |


### 8.14 Phase 2 hardening: kitchen lock and concurrency (AJ's review, 2026-10-16)

**Policy (AJ):** no ordinary edit after the kitchen hand-off; no manual status change or recall that bypasses the lock; no customer note on a Completed or Cancelled order; a team note stays allowed on a Cancelled order (it documents the cancellation) and is refused on a Completed one; the customer's venue form stays locked after hand-off and no correction workflow exists (any post-handoff correction needs its own approved workflow).

| Area | What was built |
|---|---|
| Authoritative lock | `isKitchenLocked(orderStatus, selectionStatuses)` (`orders/order-lock.ts`): Sent to Kitchen, Completed, or any menu approval Final/Locked. Read inside the writing transaction after the locks. Enforced in `updateOrderInTransaction`, `deleteOrder`, `setMenuSelectionItems`, `setCustomMenuPricePerPlate`, `updateMenuApprovalMealPlan`, `saveOrderWithMeals`, `updateEvent`/`deleteEvent`, and the customer link's venue form and confirmation. A plain save cannot write Sent to Kitchen/Completed; the order actions drop `status`. |
| Manual move-back | `changeStatusManually` refuses leaving Final/Locked, leaving Cancelled, or lowering the stage once the kitchen has started (`kitchenWorkStarted`: stage, audit-log history of the stage, stock sent). Closing (Cancelled/Delivered) is never refused. |
| Notes | `addNoteToOpenOrder` (team action and customer link) checks the order status in the same locked transaction as the write. |
| Locking strategy | One order everywhere: (1) the order's menu approvals by id, (2) the order row, (3) inventory rows/batches. `lockAndReadOrder(..., { alsoLockOrder })` in `orders/kitchen-lock.ts`. `sendOrderItems`, `returnOrderItem`, `returnAllOrderItems` take 1 and 2 and re-check the order status under the locks. |
| Delete | `deleteOrder` is one transaction: locks, eligibility, `returnAllOrderItemsInTransaction`, delete. A refusal or failure rolls the returned stock back. The hand-off refuses a menu whose order was deleted. |
| Tests | `__tests__/kitchen-lock.test.ts` (23), `production/__tests__/kitchen-lock-concurrency.test.ts` (12: send vs move-back both orders, send vs stage change, delete vs hand-off both orders, delete rollback, six all-at-once runs), the location test in `e2e/locations.spec.ts`. Two Phase 2 tests changed because they asserted the old looser behaviour (Final/Locked allowed notes and venue edits): `price-freeze.test.ts`, `custom-price-and-reapproval.test.ts`; `menu-approval.test.ts` now uses a real order. |
| Evidence at that point | Vitest 156 files / 1557 passed; typecheck, lint, check:migrations clean; Playwright re-run of the specs that failed during a dev-server restart: 40 passed, 2 failed (the two baseline failures). |

**Deferred limitations (carried forward; not separate projects):**

| # | Limitation |
|---|---|
| L1 | Direct inventory edits without an order id are not seen as evidence that kitchen work started. |
| L2 | Cooking never recorded in Platterly (no stage change, no stock sent) cannot be detected by the move-back safeguard. |
| L3 | Deleting an order leaves its event and menu approval behind, orphaned; the hand-off rejects an orphaned approval. No automatic repair or deletion of legacy data. |
| L4 | The dev server on port 3000 can recycle during long Playwright runs (a burst of unrelated failures means diagnose the server first). |
| L5 | `purchase-order-pdf` and `recipes-page` are baseline Playwright failures (also on `6525313`); reassess in the final verification pass. |

**Workflow note (AJ, 2026-10-16):** implementation first; one comprehensive verification pass at the end of all planned work (typecheck, lint, migration checks, full Vitest, relevant and full Playwright, permission/location/kitchen-lock/inventory/approval journeys, final diff review). Targeted tests only to diagnose or validate a critical change.


## 9. Phase 3: unified Orders list (built 2026-10-16, uncommitted)

No schema change, no permission change, no new route. The Orders page keeps requiring `orders: view`.

| Area | What was built |
|---|---|
| Pure rules | `orders/approval-list.ts`: `ApprovalFilter` ("NOT_STARTED" or a menu status), `parseApprovalFilter`, `parseOrdersView` (anything but `past` is the normal list), `approvalWhere`, `outstandingApprovalWhere`, `approvalColumnStatus`, `OUTSTANDING_APPROVAL_STATUSES` (Needs Review, Sent, Reviewing, Changes Requested, Customer Approved) |
| Query | `listOrders` gains `approval` and `outstandingApproval`. Both go in the `AND` list so they cannot collide with the location filter's own `events` key. The default `when: "upcoming"` call is unchanged, so past orders still never reach the default list, the Dashboard, the Calendar or the customer's history. |
| List | New "Menu Approval" column (`order-list-row.tsx`, test id `order-approval-cell`): the approval status badge in the same tones as the card, "Not Started" for an order with none, "—" for a Completed or Cancelled order that never had one. The grid card is unchanged (its shipped callout already shows the in-progress approvals; a Not Started callout would be a new pattern, so it needs the design system first). |
| Filters | `orders-filter-bar.tsx`: "Orders view" (Upcoming Orders / Past: Approval Pending, `?view=past`) and "Menu approval filter" (`?approval=`). An unknown value in the address is ignored. |
| Past view | `?view=past` lists past-event orders (event over by the existing UTC rule) whose order is not Completed or Cancelled and whose approval is outstanding (Decision 9). Orders with no approval are not in it (the plan's "all past" listing was not built). |
| Tests | `orders/__tests__/approval-list.test.ts` (6: parsing, the column rule, Past membership, default list unchanged, filters, location and business isolation), `e2e/orders-approval-list.spec.ts` (column, filter by address, Past view, the view switch; passed once), helper `setOrderEventDay` in `e2e/db.ts`. |


## 10. Phase 4: navigation and redirects (built 2026-10-16, uncommitted)

No schema, no new permission. The public `/menu-approval/[token]` link and its token behaviour are not touched.

| Area | What was built |
|---|---|
| `/menu-approvals/[id]` | Runs the same `menus: approve` and location checks first (a person who may not see it is refused exactly as before), then redirects to `/orders/{orderId}?tab=approval`, keeping `?version=N` when it is a number. A missing approval or one with no order is a 404. |
| `/menu-approvals` (queue) | After the permission check, anyone with `orders: view` is redirected to `/orders` (`?status=X` becomes `/orders?approval=X`; unknown values are dropped). The queue still renders for a role that can approve menus but cannot open Orders, because it is that role's only way in. |
| Sidebar | `withoutSupersededEntries` (`components/app-shell/nav-permissions.ts`, used by `(app)/layout.tsx`): the "Menu Approvals" entry is hidden when Orders is allowed, shown otherwise. Orders keeps its place. |
| Kept | `menu-approvals` stays a reserved word; the old review component and queue page stay in the code until Phase 5 (AJ's approval needed). Other in-app links to the old address still work through the redirect. |
| Specs updated (not weakened) | `menu-approvals.spec.ts`, `order-journey.spec.ts`, `approval-responsive.spec.ts` and `menu-approval-review.spec.ts` now reach the review through the order's tab (new helper `openOrderApprovalTab`, locators scoped to `#order-panel-approval`; the response wait uses `/orders/`). One assertion was removed on purpose: the old page's "View Order" link has no meaning inside the tab. |
| New tests | `e2e/menu-approvals-redirect.spec.ts` (2: redirects, version handling, 404, sidebar entry gone; a menus-approve-only role keeps the queue, gets 403 on Orders and lands on the restricted view), `components/app-shell/__tests__/nav-permissions.test.ts` (4). Each passed when run on its own after being written; the changed specs above each passed once. |

**Decision recorded (default chosen, reversible):** an approval-only role without `orders: view` keeps the queue and its sidebar entry. The plan left this open (8.9, F9); the alternative would be to open the Orders list to `menus: approve` roles, which would expose customer phone and amounts that the restricted order view deliberately hides. AJ can change this.


## 11. Phase 5: cleanup (AJ approved 2026-10-16; built, uncommitted)

No schema change, no new feature, no data touched.

| Removed | Why it is safe |
|---|---|
| `app/(app)/menu-approvals/[id]/_components/menu-approval-review.tsx` (and its folder) | The only user was `/menu-approvals/[id]`, which now redirects after its checks. The order's Menu Approval tab renders the same shared components (`modules/menu-approvals/_components/review/`). |
| `header.canOpenOrder` (type, the two page props, the loader's `Omit`) and its test assertion | It only drove the old page's "View Order" link; the tab always passed `false`. |
| The order sidebar panel's fallback links to `/menu-approvals` and `/menu-approvals/{id}` | The page now always passes the order's own tab address; an order without an approval links to the tab (where it can be started) for someone who can manage approvals. |
| Stale wording in comments and doc strings that named the old page | Replaced with the tab. |

| Narrowed | What |
|---|---|
| `listMenuSelectionsForKitchen` | Loads only the customer's name, the event and the location's name (no phone, email, amounts or dish prices travel with the queue's data). |

**Retained on purpose:**

| Kept | Why |
|---|---|
| `/menu-approvals/[id]` route (permission, business and location checks, then redirect with `?version=N` kept) | Old bookmarks and links; a person who may not see the approval is refused exactly as before. |
| `/menu-approvals` route: redirects to `/orders` for anyone with `orders: view` (`?status=X` becomes `?approval=X`); renders the queue for a role that can approve menus but cannot open Orders | That role's only way in. The queue shows customer name, event, date, location and status only. |
| Sidebar "Menu Approvals" entry for that same role (`withoutSupersededEntries`) | Same reason. |
| `menu-approvals/actions.ts`, `_components/review-actions.ts`, `_components/menu-approvals-filter-bar.tsx`, `page.tsx` | The tab and the queue use them; every action keeps its permission, location and stage checks. |
| `/menu-approval/[token]` (customer link) and the reserved word `menu-approvals` | Unchanged. |
| `revalidatePath("/menu-approvals")` calls | The queue still exists. |

**How the restricted role works:** `menus: approve` without `orders: view` or `orders: edit`: sidebar shows Menu Approvals; `/orders` is a 403; the queue lists names and events; each row (and any old link) goes through `/menu-approvals/{id}` to `/orders/{id}?tab=approval`, which renders the restricted read-only order view with the approval tab (no order form, no customer phone or email, no amounts beyond what the approval itself shows). With `orders: view` but not edit they see the Orders list and the read-only tab.

**Tests:** nothing was retired. The old page's coverage already moved to the tab in Phase 4 (`menu-approval-review.spec.ts`, `menu-approvals.spec.ts`, `order-journey.spec.ts`, `approval-responsive.spec.ts`). The redirect spec gained a check that the queue page carries no phone or amount for the restricted role. The `canOpenOrder` assertion in `review-data.test.ts` was removed with the field.

**Deferred (uncertain dependency):** the Phase 1 snapshot-compare dump in `menu-approval-review.spec.ts` (`REVIEW_SNAPSHOT_DIR`) now dumps the tab, so its old baselines are not comparable; nobody depends on it. The queue page itself (`menu-approvals/page.tsx`) is kept for the restricted role; removing it would need a different entry for that role (AJ's decision). Design-system artifact: no new pattern was added, so nothing to publish.
