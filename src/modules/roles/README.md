# roles

Roles & Permissions redesign, Phase A (AJ, 2026-10-17). Plan: `docs/roles-permissions-redesign-plan.md`. The editor UI (Phase B) is not built.

## Three layers

| Layer | What it controls | Where it lives |
|---|---|---|
| Module access | `view` on a module opens the screen | `src/lib/auth/permissions.ts` (`statement`, presets), `nav-permissions.ts` |
| Actions | create / edit / delete / approve / export / `kitchen: updateStatus, viewPdf` | the same statements; `requirePermission` / `hasPermission` in `src/lib/auth/require-session.ts` |
| Sensitive data | the `sensitive` resource, eight independent keys: `menuPrices`, `orderPrices`, `paymentDetails`, `supplierCosts`, `recipeCosts`, `profitability`, `financialReports`, `commercialDocuments` | `SENSITIVE_KEYS` in `src/lib/auth/role-matrix.ts`; `sensitiveAccess`, `canSee`, `requireSensitive` in `require-session.ts` |

`kitchen` (Kitchen Dashboard, its PDF, the cooking stage) and `recipes` are their own resources, no longer borrowed from `menus` and `inventory`. `stockRequests` is reserved in the model and not built.

## Presets (what each role holds before a business changes it)

| Role (id) | Modules and actions | Sensitive keys |
|---|---|---|
| Admin (`owner`) | everything, never overridden | all |
| Manager | operational modules, create/edit, `menus: approve`, reports view/export, audit view, Settings view; the **only** delete is `staffing: delete` | none |
| Staff | Orders and Quotations, view only | none |
| Kitchen Team (`kitchen`) | `kitchen: view, updateStatus, viewPdf`; recipes view/create/edit; staffing (incl. delete); no Orders, Quotations or Menus | none |
| Store / Inventory (`inventoryTeam`) | inventory full, recipes view, reports view/export | `supplierCosts` |
| Accounts (`accounts`) | invoices view/create/edit/export, payments view/create/manage, expenses, reports, orders and customers view | `orderPrices`, `paymentDetails`, `financialReports`, `commercialDocuments` |
| Sales & Event (`salesEvents`) | customers, orders, quotations, event types create/edit, menus view + approve, staffing view, reports view | none |

A saved override (`RolePermissionOverride.grants`, per business and role) replaces only the modules it lists; a module added later keeps its preset, and an old override can never switch a sensitive key on (`role-grants.ts`, `savedModules`).

## Enforcement order

Session and tenant, module access, action, then the sensitive key **before** any protected field is built. Protected fields are removed on the server and never reach the browser, a PDF, an export or a nested object:

- `redact.ts` / `keep-pricing.ts`: serializers for menus, pickers and saved pricing (a role that cannot see prices can still save an order without changing them).
- Dashboard snapshot, Orders, quotations, menu approvals, recipes, inventory, suppliers, purchasing, customers, reports tabs, exports, PDFs, audit log, global search and team notifications read through the same checks. `SensitiveAccessProvider` (`src/components/sensitive-access.tsx`) gives client forms the same answer.
- The invoice PDF (`/invoices/[id]/pdf`) needs `commercialDocuments` (403 without it); the purchase order PDF needs `inventory: view` and is rendered unpriced (quantities only) without `supplierCosts`; the kitchen sheet needs only `kitchen: viewPdf`. Finance exports need `financialReports` or `profitability` on top of `reports: export`.

## Tests

| Layer | Tests |
|---|---|
| Presets and matrix | `src/lib/auth/__tests__/permissions.test.ts` (including: Manager's only delete is `staffing`), `src/lib/security/__tests__/role-matrix.test.ts`, `__tests__/role-grants.test.ts` |
| Sensitive access and redaction | `__tests__/sensitive-access.test.ts`, `__tests__/redact.test.ts` |
| Kitchen Team | `__tests__/kitchen-access.test.ts` (allowed actions, no orders/menus/prices, `kitchen` permission used only by the Kitchen Dashboard actions) |
| Browser, real server responses | `e2e/roles-sensitive-access.spec.ts` (Admin vs Manager, grant and revoke on the same signed-in session, raw HTML and RSC payload hold no protected amount, kitchen stage change, kitchen PDF 200, commercial PDFs and exports 403), `e2e/role-permissions.spec.ts`, `e2e/kitchen-role-order-view.spec.ts`, `e2e/export.spec.ts` |

## Not built / deferred

- Phase B: the three-tab editor (Module Access, Actions, Sensitive Data), "why can't they?" summary and preset diff. Today's Manage Role Permissions still edits modules and actions only; sensitive keys are not yet editable in the UI (set through the override table).
- Stock requests (`stockRequests`, `inventory: receive`): reserved, not built.
- Existing businesses lose price visibility for every role except Admin when this ships (intended; no live environment yet).
