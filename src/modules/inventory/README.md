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

## Stock batches and FIFO (2026-10-15)

**One rule keeps the numbers honest:** `Inventory.stockCount` is the on-hand number every screen reads, and it equals the sum of the batches' `remainingQuantity` plus any *unbatched* stock (written before batches existed or directly in the database; its cost is unknown). Every change to stock goes through `batches.ts` (`createBatch`, `consumeStock`, `restoreOrderStock`), which updates the batch and the count together, so they cannot drift. `findStockMismatches` reports any item where they disagree, and `recordOpeningBatch` gives unbatched stock an explicit opening batch.

**Where batches come from**
- A delivery received on a purchase order (`RECEIPT`): quantity, actual unit cost, received date, optional expiry and lot. Different costs or expiry dates are different batches, and earlier receipts and batches are never edited.
- Opening stock (`OPENING`): what an item already held when batches were introduced, or the opening stock given when an item is created or imported. Cost and expiry are the item's own, if it had them; the received date is never invented, so it stays empty.
- Manual Stock In (`STOCK_IN`) and positive Adjustment (`ADJUSTMENT`): a batch with no price and no expiry (use a purchase order receipt when those are known).

**How stock is used**
- FIFO for costing: `consumeStock` takes the oldest batch first (no received date counts as oldest, then arrival order), after any unbatched stock. Each slice is a `StockAllocation` on the ledger row with the batch's cost copied onto it, so a later delivery at another price never changes what an earlier consumption cost (`allocationCost`, `orderStockCost`).
- Never below zero: the batch and the count are decremented only while enough is left; two people taking stock at once cannot take the same units. Too little usable stock throws `InsufficientStockError` and changes nothing.
- Expired and quarantined batches are never consumed automatically (the expiry day itself is still usable). A Stock Out is refused with the reason ("Only 30 is usable: 40 is quarantined"); sending items to an order treats them as short. A negative Adjustment is the way to write off expired stock, and takes the unusable batches first.
- Returns (an order's undo or a cancelled order) go back into the same batches at the same costs (`restoreOrderStock`); anything that cannot be traced to a batch (sent before batches existed) returns as unbatched stock.
- FEFO is advice only: the Batches drawer shows the batch that expires soonest when it differs from the FIFO one (`recommendedBatchId`). Costing stays FIFO.
- **Tracks expiry controls expiry:** for an item that does not track it, a stored batch expiry date is kept but neither blocks consumption nor warns (Inventory list, Batches, Dashboard, report); switching tracking on again resumes both from the stored dates. Nothing is rewritten when the setting changes.

**Recipe costing (2026-10-15, second pass):** a recipe is costed by allocating each ingredient's required quantity across its usable batches with the same FIFO rule consumption uses (`fifo-plan.ts` `planFifo`, shared by `consumeStock`, the server preview `previewConsumption` and the recipe dialog). `recipe-cost-math.ts` `costRecipe` returns VERIFIED only when every unit comes from a batch with a known cost (a confirmed 0 is known); otherwise INCOMPLETE, with the ingredients named as UNKNOWN_COST (an unknown-cost batch or loose stock is used in its turn, never skipped) or NOT_COVERED (not enough usable stock). The item's own cost is never used for the verified figure; it only feeds a separate, labelled "Estimated" figure. The old single-batch `currentUnitCosts` and the item-cost based `costPerServing` were removed. What an order's stock cost is read from its allocations (`orderStockCost`), shown on the order's Inventory tab, and does not change when later batches arrive.

**Screens:** Inventory list (earliest expiry, "Expired stock" / "Expires soon", a banner), a Batches drawer per item (FIFO order, cost, expiry, lot, quarantine / release), the Dashboard's Inventory Status card (counts by batch), the Receive stock drawer, and the order page's receipt history.

### Existing stock (migration `20261015100000_receiving_and_fifo_batches`)
- `stockCount` and the ledger quantity were widened from 2 to 3 decimals (the purchase order quantities already had 3), which loses nothing.
- Every item with stock got one `OPENING` batch holding exactly its `stockCount`, so the sums match from day one. The batch's cost is the item's own `costPerUnit` and its expiry the item's own `expiryDate`, if it had them (otherwise empty); `receivedDate` is empty because it was never recorded. Nothing was invented, and `stockCount` and the old ledger rows were not changed. Older ledger rows have no allocations (what those past consumptions cost is unknown).
- Legacy stock needing attention: opening batches with no cost (their consumption has an "unknown" cost and the order page says so) and perishable items whose opening batch has no expiry. List them with:
  `select i.name, b."remainingQuantity", b."unitCost", b."expiryDate" from stock_batch b join inventory i on i.id = b."inventoryId" where b.source = 'OPENING' and b."remainingQuantity" > 0 and (b."unitCost" is null or (i.category in ('Dairy','Vegetables','Fruits','Meat & Poultry','Seafood') and b."expiryDate" is null));`
- Run `findStockMismatches` after the migration on a real database; the migration itself leaves none.

### Rules for receiving (`purchasing/receipt-rules.ts`)
Quantity above zero and not more than is still to arrive (no over-delivery); unit cost required and above zero; received date not in the future and not before the order was raised; expiry required for Dairy, Vegetables, Fruits, Meat & Poultry and Seafood, never before the received date and never already past; lot, invoice number and notes optional with length limits; one idempotency key per submission.

### Decisions applied (AJ, 2026-10-15; migration `20261015200000_batch_cost_and_expiry_rules`)
1. **Over-delivery** stays refused. The explicit route is an authorised extra on the receipt line: tick "Authorise the extra", give a reason, and the actual cost is recorded with it (`GoodsReceiptLine.extraQuantity` / `extraReason`, shown in the receipt history). Amending the ordered quantity is not built; the extra can only be authorised while the order is still open (Ordered or Partly received).
2. **Zero cost** is allowed as confirmed free goods and needs a reason (`costNote`, on the receipt line and the batch). Negative is refused. `StockBatch.unitCost` null = unknown, 0 = confirmed free, above 0 = a confirmed cost. A receipt always has a cost; unknown exists only on opening stock, manual Stock In and positive adjustments. Free goods do not reset the item's own cost.
3. **Opening batches** no longer carry the item's cost: the migration set every opening batch's cost to unknown, and `createInventoryItem` only uses a cost passed with the opening stock (the Excel/CSV import's cost column counts). A batch with an unknown cost can be confirmed once (Batches -> Confirm cost: a cost, or 0 with a reason); a known cost is never changed (`confirmBatchCost`). No historical cost or expiry date is invented.
4. **Tracks expiry** is an item setting (`Inventory.tracksExpiry`). The category only supplies the default when an item is created (the form's switch follows the category until it is touched); receiving, manual Stock In and positive adjustments require an expiry date for items that track it, and never accept one that has passed. The migration turned the setting on for the categories that were already enforced. Opening and other legacy batches keep their empty expiry and are flagged "Not recorded".
5. **Manual Stock In** (Stock Movement drawer): unit cost (0 needs a reason) or "Cost unknown" must be chosen, expiry date (design-system calendar) when required, optional lot, note. Each Stock In writes one ledger row and one batch (and an allocation linking them); the quantity is counted once. A positive adjustment starts a batch with an unknown cost.
6. **Valuation** is one calculation (`valuation-math.ts`, loaded by `valuation.ts`): remaining quantity x batch cost over known-cost batches, unknown-cost quantity reported apart, flagged incomplete while any exists. The Dashboard's Inventory Status card, the Inventory page and the Inventory report (also the Ops view and the Excel export) all use it. The report's purchases and supplier balances value received stock at the price on each receipt.
7. **Historical consumption** is not backfilled. A movement with no batch allocation has an unknown cost; the report leaves it out of the actual-cost totals, counts it, and shows an estimate at today's item cost separately, labelled as an estimate and in no total.

### Limitations and open points
- Recipe costs are informational previews against current stock: each recipe is previewed on its own, nothing is reserved or deducted, and shared ingredient demand across recipes is left to production planning.
- Estimates are calculated on demand from the item's own cost, labelled Estimated (or "Estimate unavailable" when none can be worked out), and never stored or mixed into verified cost; historical consumption cost comes only from recorded batch allocations.
- Amending an order's quantity is not built (only the authorised extra).
- The category list that supplies the Tracks expiry default is fixed in code (`EXPIRY_DEFAULT_CATEGORIES`).
- Supplier balances and purchase totals for orders received before receipts were recorded still use the order line's own cost.
