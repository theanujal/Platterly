# Roles & Permissions redesign: audit and plan

Status: Phase 1 (audit) and Phase 2 (plan) written 2026-10-17. No code changed. Phase 3 waits for AJ's answers to section 5.

## 1. Audit: what exists today

### Architecture

| Piece | File | What it does |
|---|---|---|
| Resource/action statement | `src/lib/auth/permissions.ts` | One Better Auth access-control `statement`: 16 resources (`tenant`, `users`, `customers`, `eventTypes`, `orders`, `quotations`, `menus`, `inventory`, `invoices`, `payments`, `expenses`, `reports`, `audit`, `staffing`, `settings` + Better Auth defaults) and the built-in grants of 7 roles: `owner`, `manager`, `staff`, `kitchen`, `inventoryTeam`, `accounts`, `salesEvents`. |
| Role labels/copy | `src/lib/auth/role-metadata.ts` | Labels and descriptions. `owner` is labelled "Owner"; there is no "Admin" role (the Chunk 5 "Team Admin" was removed on purpose, AJ 2026-09-20). |
| Per-business overrides | `RolePermissionOverride` table (`organizationId`, `role`, `grants` Json, `updatedBy`), `src/modules/roles/role-grants.ts` | An owner replaces a role's grants for the 12 modules in `MATRIX_MODULES`. Resources outside the matrix (`tenant`, `users`, `settings`) are never overridable. Owner is never overridable. |
| Enforcement | `src/lib/auth/require-session.ts` | `requirePermission` (403 page) and `hasPermission` (boolean) both resolve through `roleAllows`. Tenant scope comes from the session's active organization plus a `Member` row; a disabled member is refused. No Next middleware by design. |
| Editor UI | `src/app/(app)/settings/(sections)/team/_components/role-permissions-form.tsx`, `src/lib/auth/role-matrix.ts` | A module x View/Create/Edit/Delete/Special checkbox grid per role (reworked today into view/edit mode). |
| Sidebar | `src/components/app-shell/nav-permissions.ts` | Each link maps to one permission. |
| Surface | 95 files call `requirePermission`/`hasPermission`; 29 `actions.ts` files; 12 `route.ts` handlers (PDFs, exports, cron, webhooks, Ops). There is no public REST API (Chunk 25 was removed): the "API" is Server Actions and server components. |

SaaS administration is separate and stays so: Platterly Ops (`apps/ops`, own app and database) has its own sign-in; it is not a business role.

Data in the dev database: 42 `owner` members, 1 `manager`; 3 override rows (manager, kitchen, accounts), all test data. There is no live environment.

### Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | There is no sensitive-data layer. Prices are shown to anyone who can open the module. | `orders: view` lists show amounts (patched today by gating on `invoices: view`); `quotations: view` shows totals (71 money references in its components); `menus: view` shows menu, item and add-on prices (28 + 17 + 18 references); `inventory: view` shows unit costs (54 references) and supplier purchase prices; `customers: view` shows each order's total on the customer profile; `reports: view` shows revenue for every role that has it (Staff and Sales both do). | High |
| F2 | The Dashboard decides money visibility from `orders: create` or `payments: view`. | `dashboard/page.tsx` (`canSeeMoney = canSell \|\| canViewPayments`). The snapshot (`dashboard/_data.ts`) is computed with revenue for everyone; only the rendering is conditional. | High |
| F3 | The editable order page is gated on `orders: edit` and carries the pricing editor, pricing tab, payments and invoice into one client form. The order form computes totals in the browser from prices it is sent. | `orders/[id]/page.tsx` (29 money references, 42 in components) | High |
| F4 | Kitchen operations ride on `menus`, not on a kitchen permission. `kitchen` has `menus: view, edit`, which also lets it edit the whole Menu Catalog (prices included). Cooking-status update is `menus: edit`; the prep sheet and its PDF are `menus: view`. Order details used to need `orders: edit` (fixed today by a read-only view for `orders: view`). | `kitchen-dashboard/actions.ts`, `[id]/page.tsx`, `[id]/pdf/route.ts` | High |
| F5 | The Kitchen Team cannot use Recipes: the Recipes page needs `inventory: view`, which the role does not have. Recipes also show ingredient cost. | `recipes/page.tsx` | Medium |
| F6 | There is no stock-request feature. "Send items to this order" exists and is done by the store (`inventory: edit`). Nothing lets the kitchen ask for stock. | `kitchen-dashboard/production/actions.ts` | Gap |
| F7 | Module access and actions are the same thing: `view` is both "can open the screen" and "can read everything on it". Several modules mix unrelated pages (Orders = Orders + Calendar; Inventory = stock + suppliers + purchasing + recipes). | `nav-permissions.ts` | Medium |
| F8 | Staff defaults are broad: view of customers, menus, inventory, event types, and reports with export. The brief wants Orders and Quotations only. Sales has `reports: export`. | `permissions.ts` | Medium |
| F9 | Manager cannot delete anything today, including staff records (`staffing` gives view, create, edit). The brief wants staff-record deletion only. | `permissions.ts` | Low |
| F10 | PDFs and exports are gated by the module, not by what they contain: invoice PDF `invoices: view`; purchase-order PDF `inventory: view` (shows unit prices); reports/expenses/profitability/audit exports `reports: export`; kitchen sheet PDF has no prices (good). The kitchen sheet and commercial PDFs are not separate permissions. | `route.ts` files | Medium |
| F11 | `menu-catalog/menus` and `menu-catalog/items` pages have no leaf permission check; only the layout's `menus: view`. Mutations are checked in actions. | `menu-catalog/layout.tsx` | Low |
| F12 | Tenant isolation, disabled-member lockout, location scoping and audit logging are sound and tested (`src/lib/security/__tests__`). They are kept as they are. | tests | OK |
| F13 | Background work (cron emails, WhatsApp, notifications) runs as the system and sends customer-facing documents with prices. That is intended and is not a user view; it is documented, not gated. | `notifications`, `cron` | Note |

### Compatibility risks

| Risk | Detail |
|---|---|
| Behaviour change | Hiding prices by default takes prices away from every non-Admin role that currently sees them. That is the requirement, but the Accounts role works on amounts all day, so its preset needs a decision (section 5). |
| Order form | It needs prices to total live. A role without price access needs a form that works without them: price inputs and totals hidden, totals computed on the server at save. This is the largest piece of work. |
| Client props | Server pages pass whole Prisma records to client components. Hiding means building the record without price fields on the server. Prices must not be serialised to the browser. |
| Overrides | Existing override rows only contain the 12 old modules. New resources are absent in them, so they fall back to the new built-in default (deny for sensitive data). No data is rewritten. |
| Better Auth | Its own organization endpoints read `roles`. New resources are added to the statement and to every role (empty where denied). Role ids do not change. |

## 2. Target model

Three independent layers, all kept inside the existing `statement` / override mechanism (no parallel system).

**A. Module access** = the module's `view`. It opens the screen and shows non-sensitive fields. Today's modules are split where one permission covers two jobs:

| Module | Today | Change |
|---|---|---|
| Orders, Quotations, Customers, Event Types, Menus, Expenses, Reports, Audit, Staffing, Settings, Users | existing resource | kept |
| Calendar | `orders` | kept under Orders |
| Kitchen (Kitchen Dashboard, kitchen orders, prep sheet) | borrowed `menus` | **new resource `kitchen`**: `view` |
| Recipes | borrowed `inventory` | **new resource `recipes`**: `view`, `create`, `edit`, `delete` |
| Stock & Supplies, Suppliers, Purchasing | `inventory` | kept as `inventory` |

**B. Actions** (per module, only the meaningful ones):

| Module | Actions |
|---|---|
| Orders | create, edit, delete, bypass_date_restriction (owner only) |
| Quotations | create, edit, delete |
| Customers | create, edit, delete |
| Menus | create, edit, delete, approve |
| Kitchen | updateStatus, viewPdf (kitchen sheet PDF) |
| Recipes | create, edit, delete |
| Inventory | create, edit, delete |
| Invoices | create, edit, delete, export |
| Payments | create, manage |
| Expenses | create, edit, delete |
| Reports | export |
| Staffing | create, edit, delete |
| Stock requests | **prepared, not built** (`inventory: receive` also reserved): see decision D4 |

Delete is always its own action. The Manager preset gets `staffing: delete` and no other delete.

**C. Sensitive data**: one new resource, `sensitive`, with these actions (each maps to a real field or document):

| Action | Covers |
|---|---|
| `menuPrices` | Menu price per plate, dish price, add-on price, extras |
| `orderPrices` | Order and quotation prices, totals, discounts, charges, the pricing tab, the order amount on lists and on the customer profile |
| `paymentDetails` | Payments, advance, balance, payment status, overdue payments |
| `supplierCosts` | Supplier purchase prices, inventory unit cost, purchase order amounts |
| `recipeCosts` | Ingredient and recipe cost |
| `profitability` | Profitability page, margins, event costs |
| `financialReports` | Revenue and finance report tabs, finance exports (reports, expenses, profitability) |
| `commercialDocuments` | Customer-facing PDFs: invoice, quotation, receipt, payment link |

`kitchen: viewPdf` and `sensitive: commercialDocuments` are separate, so a kitchen sheet never needs a commercial permission.

**Enforcement rule.** Every server entry point checks, in order: session and tenant, module access, action, then the sensitive key before any protected field is built. Protected fields are removed on the server (a serializer per record type) so they never reach the browser, a PDF, an export or a nested object. Internal calculations keep using the real numbers.

**Role changes through the existing override table.** `RolePermissionOverride.grants` already holds JSON per role; `sanitizeGrants` is extended to the new modules and to `sensitive`. No table change is needed.

## 3. Role presets (least privilege where the brief is silent)

| Role (id) | Module access | Actions | Sensitive data |
|---|---|---|---|
| Admin (`owner`) | all | all | all |
| Manager (`manager`) | all operational modules, Settings view | create/edit/approve across modules; `staffing: delete`; no other delete; no roles | none |
| Staff (`staff`) | Orders, Quotations only | none (view-only until granted) | none |
| Kitchen Team (`kitchen`) | Kitchen, Recipes | `kitchen: updateStatus, viewPdf`; recipes create/edit; stock request (prepared) | none |
| Store / Inventory (`inventoryTeam`) | Inventory, Recipes (view) | inventory create/edit/delete (full management of its own area) | `supplierCosts` |
| Accounts / Finance (`accounts`) | Invoices, Payments, Expenses, Reports, Orders and Customers (billing view) | invoices create/edit/export; payments create/manage; expenses create/edit; no delete | see D3 |
| Sales & Event (`salesEvents`) | Customers, Orders, Quotations, Event Types, Menus (view + approve), Staffing view | create/edit; menu approve; no delete | none |

## 4. File-by-file plan

| Area | File | Change | New or existing |
|---|---|---|---|
| Model | `src/lib/auth/permissions.ts` | add `kitchen`, `recipes`, `sensitive`; re-cut the 7 presets; `staffing: delete` for Manager | existing |
| Model | `src/lib/auth/role-matrix.ts` | add the new modules and a `SENSITIVE` list; sanitizer handles them | existing |
| Model | `src/modules/roles/role-grants.ts` | defaults/overrides cover the new resources; a `canSee(key)` helper | existing |
| Model | `src/lib/auth/require-session.ts` | `requireSensitive` / `canSee` beside `requirePermission` / `hasPermission` | existing |
| Model | `src/modules/roles/redact.ts` | per-record serializers (order, quotation, menu, item, inventory, purchase order, recipe, customer orders) | new |
| Schema | `prisma/schema.prisma` | none expected | n/a |
| Kitchen | `kitchen-dashboard/**` pages, `actions.ts`, `[id]/pdf/route.ts`, `production/*` | move from `menus` to `kitchen` | existing |
| Kitchen | `orders/[id]/page.tsx`, `approval-only-order-view.tsx` | read-only view stays for view-only roles; prices removed through the serializer | existing |
| Recipes | `recipes/**`, `modules/recipes` | gate on `recipes`; ingredient lookup that does not need `inventory: view`; costs behind `recipeCosts` | existing |
| Pricing | `orders/**`, `quotations/**`, `customers/[id]`, `menu-catalog/**`, `inventory/**`, `suppliers/**`, `purchasing/**`, `dashboard/**`, `reports/**`, `overdue-payments`, `profitability`, `invoices/**` | read through the serializers; render without prices | existing |
| Order form | `orders/_components/order-form.tsx`, `quotation-form.tsx`, `menu-planning-section.tsx` | work without prices; totals computed on the server | existing |
| PDFs/exports | `invoices/[id]/pdf`, `purchasing/[id]/pdf`, `reports/export`, `expenses/export`, `profitability/export`, `audit-log/export`, `kitchen-dashboard/[id]/pdf` | add the sensitive check; kitchen sheet on `kitchen: viewPdf` | existing |
| UI | `team/_components/role-permissions-form.tsx` | replaced by a role list plus a three-tab editor | existing |
| UI | `team/_components/permission-*.tsx` | module row, action chips, sensitive switch, "why" summary, preset diff | new |
| Copy | `role-metadata.ts`, `role-permissions.ts` | descriptions follow the new presets | existing |
| Nav | `nav-permissions.ts` | Kitchen Dashboard and Recipes use their own resources | existing |
| Docs | `.claude/STATUS.md`, `MEMORY.md`, `src/modules/roles/README.md` | document the model | existing |

UI editor: role cards (name, one line, "Customised" badge, Edit Permissions) on the left; the selected role opens three tabs: **Module Access** (a switch per module with what it unlocks), **Actions & Operations** (grouped switches, disabled with a reason when the module is off), **Sensitive Data Access** (a switch per key with the fields it covers). Each row shows "Preset" or "Changed". A summary panel answers "why can't they?" in plain words. "Restore recommended preset" shows the differences first and asks to confirm. Keeps today's Edit, Save with confirm, Cancel, unsaved-edit guard and toast.

## 5. Tests (map to the brief)

| Brief item | Test |
|---|---|
| 1, 2, 3, 4, 9, 10, 11 | extend `src/lib/auth/__tests__/permissions.test.ts` and `src/modules/roles/__tests__/role-grants.test.ts` with preset assertions per role, including sensitive keys |
| 5, 6, 7, 8 | new `src/modules/roles/__tests__/kitchen-access.test.ts` (actions called as a kitchen user) plus `e2e/kitchen-role-order-view.spec.ts` extended: dashboard, status change, kitchen PDF 200, commercial PDF 403, no price text in the page source |
| 12 | `e2e/role-permissions.spec.ts`: Admin grants then revokes a sensitive key, the next request reflects it |
| 13, 14 | `src/lib/security/__tests__/server-actions.test.ts` and `cross-tenant.test.ts` extended to new actions; direct URL/PDF/export requests per role |
| 15 | existing suites (orders, menu approvals, inventory, purchasing, recipes) run unchanged |
| serializers | `src/modules/roles/__tests__/redact.test.ts`: no price key at any depth |

## 6. Decisions needed from AJ before Phase 3

| ID | Question | Recommendation |
|---|---|---|
| D1 | "Admin" vs the existing `owner` role. The brief says Admin; the code and UI say Owner, and "Team Admin" was removed on purpose in 2026-09-20. | Keep the id `owner`, show the label "Admin" in the UI. One top role, no second admin. |
| D2 | Does "Staff records" (Manager may delete) mean the Staff page (floor staff without a login) or team members with the Staff role? | The Staff page (`staffing: delete`). Removing logged-in team members stays with Admin. |
| D3 | Accounts / Finance and prices. The brief says prices are granted explicitly, but billing work is all amounts. | Preset gives Accounts `orderPrices`, `paymentDetails`, `financialReports`, `commercialDocuments`; not `menuPrices`, `supplierCosts`, `recipeCosts`, `profitability`. Admin can change it. |
| D4 | "Request stock" has no feature behind it. | Build nothing now. Reserve the permission names (`inventory: receive` and a stock-request key) and show them as "coming soon" in the editor, not togglable. |
| D5 | Roles & permissions management: the brief says Manager cannot manage roles unless the Admin authorises it. Today `users` and `settings` are deliberately not delegable (privilege escalation). | Keep it Admin-only. |
| D6 | Store / Inventory team and `supplierCosts`: "may be available where operationally required". | Preset on for Store / Inventory, off for everyone else. |
| D7 | Order and quotation forms for roles without prices: totals are computed on the server and shown as "hidden". Creating or editing an order then saves without the person seeing the total. | Yes, accept. This is what "pricing hidden" means for Orders and Quotations. |
| D8 | Phasing. The work is large. | Phase A: model, presets, kitchen/recipes split, serializers for Orders, Quotations, Menus, Inventory, Customers, Dashboard, PDFs and exports, tests. Phase B: the new editor UI. Each phase ends with a green suite and a commit you approve. |

## 7. Not in scope

Stock receiving workflow, stock-request workflow, a business-level SaaS admin, new roles (Audit Viewer, Logistics), production data changes, pushing or deploying.
