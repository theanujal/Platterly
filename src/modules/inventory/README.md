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

**Update (Chunk 18.2):** the supplier name and contact text fields are gone; an item now points at a Supplier record (`supplierId`). See `src/modules/suppliers/README.md`.

## Ingredient catalog and Excel/CSV import (2026-10-10)

- **Names are unique per business and location slot, ignoring case** (`InventoryNameTakenError`, plus a unique index on
  `(organizationId, coalesce(kitchenId,''), lower(name))`). A shared item (no location) is its own slot, so the same
  ingredient can be stocked separately at two locations.
- `options.ts`: the unit and category lists shared by the form, the import and the catalog, plus `normalizeUnit` /
  `normalizeCategory` (kilogram, KGS, litre ... map to the stored value) and `ingredientImage`.
- `import/bulk-add.ts`: the one path both bulk routes use. It goes through `createInventoryItem`, so each item gets the
  same validation, audit row and (only when an opening stock is given) the "Opening stock" STOCK_IN entry. A name that
  already exists in the same slot is skipped and reported.
- `import/import.ts` + `inventory-rows.ts`: Excel/CSV import (reads files with `@/lib/import/read-table`). Columns:
  Item Name, Category, Unit, Purchase Price, Opening Stock, Low Stock Alert, Storage Location (aliases accepted).
  Required: name and unit; a blank category becomes "Other". Limits 4 MB / 1000 rows; numbers are range-checked.
  Template: `/inventory/template?format=xlsx|csv`.
- `catalog/`: Platterly's ingredient catalog (`SystemIngredient`, not tenant-scoped; `ingredient-data.ts`, loaded by
  `npm run db:seed-catalog`). Adding creates an independent Inventory Item **at zero stock, no price**, in the unit the
  kitchen confirmed, with its category illustration (`public/catalog/ingredients`). Being in the catalog says nothing
  about stock: new items show "Out of Stock" until stock is recorded.
- Location of new items: the person's held location, else the one the owner is viewing, else shared (locations off:
  shared). UI: the chevron next to Add Item (`_components/add-inventory-menu.tsx`).
