# inventory

Owning chunk: Chunk 7 — Inventory (Basic). Advanced Inventory (Recipe/BOM
consumption, a full `Supplier` entity with purchase history/outstanding
balance/Purchase Orders) is Chunk 18 (Phase 2) — not built here.

Built:

- `inventory.ts` — `Inventory` CRUD (name/category/description/image/unit/
  lowStockThreshold/costPerUnit/storageLocation/supplierName/
  supplierContact/expiryDate, simple text-field supplier contact per the
  chunk plan, no `Supplier` FK yet). `stockCount` is never written directly
  by `updateInventoryItem` — every change to it goes through
  `recordStockTransaction` (Stock In/Out/Adjustment), which is the one code
  path that ever moves the balance, kept atomic with the
  `InventoryTransaction` ledger row it writes. Hard delete (nothing
  references `Inventory` yet; `InventoryTransaction` cascades).
- `getInventoryOverviewStats`/`listLowStockItems` — feed the Dashboard's
  Inventory Overview card (Chunk 5's placeholder, wired to real data here)
  and the chunk plan's "low-stock flag".

Admin UI lives at `src/app/(app)/inventory/`, gated by the `inventory`
permission (already present in `src/lib/auth/permissions.ts` since Chunk 1).
Reuses the shared `CatalogBrowser`/`ImageDropzone`/`uploadCatalogImage`
platform components, same pattern as `menus`/`addons`/`events`.

`Inventory.storageLocation` is a plain text field, not a `Store` FK —
matches Updated doc §13 exactly; multi-location `Store` assignment is
Chunk 23 UI on the schema Chunk 1 already stubbed.
