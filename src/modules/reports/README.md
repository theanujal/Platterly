# reports

Owning chunk: Chunk 17 (basic) / Chunk 22 (advanced).

Empty by design until that chunk lands — this folder exists to hold the §57 module boundary map from Chunk 1 Group 1.1.

Chunk 22 (advanced reports): every family is a pure `*-math.ts` file (tested without a database) plus a loader.

- `menu-math.ts` — most / least selected dishes (in how many orders), never-picked dishes, Menu Type performance (an order that uses several Menu Types shares its total evenly, so revenue adds up). "Package performance" in the PRD is Menu Type performance: packages no longer exist.
- `inventory-math.ts` — stock value (snapshot), low stock, expiring soon, stock movements, purchases by supplier.
- `finance-math.ts` — revenue vs expenses by month, profit, expenses by category; receivables (aged from the event date) and payables (payments applied to the oldest receipts first). Receivables and payables are always "as of today"; the date range limits only revenue, expenses, movements and purchases.
- `storefront-math.ts` — visits by source, devices, places, embedding websites, the visit-to-order funnel by source, and orders by channel (public storefront / accepted quotation / created by the team).
- `more-reports.ts` — the loaders, one kitchen or `{ all: true }` for the Super Admin.
- Permissions on `/reports`: Sales, Events, Menu and Storefront need `reports:view`; Inventory also needs `inventory:view`; Finance also needs `expenses:view` (they show cost and profit); the recent-visitor list with IP addresses needs `tenant:view` (owner and manager).

Storefront visits live in `src/modules/storefront-visits/` (`visit-math.ts` classifies a visit, `visits.ts` writes it). The browser beacon posts to `/api/visit` once per session; IP, city and browser string are blanked after 90 days by the daily job.
