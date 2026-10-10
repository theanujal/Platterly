# menus

Owning chunk: Chunk 6 — Menu & Product Catalog. Reworked 2026-09-14 per AJ's
field-level spec (see `.claude/MEMORY.md`) — `MenuPackage` and its
fixed/per-person pricing model were removed entirely in favor of the shape
below.

Built:

- `category.ts` — `MenuCategory` CRUD (org-scoped, unique per-tenant name;
  name/description/isActive). `listCategoryMenuAssignments` is a read-only
  helper — Menu owns *editing* the Category↔Menu relationship (see below),
  Category only displays it.
- `item.ts` — `MenuItem` CRUD (name/description/image/foodType/price/
  isActive). An item's category tags (`categoryIds`, many-to-many via
  `MenuItemCategory`) and its direct menu assignments (`menuIds`, via the
  existing `MenuMenuItem`) are independently stored and replaced — neither
  is derived from the other. Soft deactivate only (`isActive`), never a hard
  delete.
- `menu.ts` — `Menu`, now the top-level sellable object: name/description/
  image/menuType (Veg/Non-Veg)/pricePerPlate/isActive. Two independent
  many-to-many relations: `items` (direct `MenuMenuItem` assignment, same as
  before) and `categoryAssignments` (`MenuCategoryAssignment`, carrying a
  per-(category,menu) `maxSelection`/`sortOrder` — the same Category can
  allow choosing 2 items on one Menu and 3 on another).
- `image-upload.ts` was relocated to `src/lib/storage/catalog-image.ts` —
  it's shared with the `events` module now, so it no longer belongs under
  one module's folder.

Admin UI lives at `src/app/(app)/menu-catalog/` (Categories/Items/Menus),
gated by the `menus` permission from `src/lib/auth/permissions.ts`. A
card-based grid/list browser (`src/components/catalog/catalog-browser.tsx`)
is shared across all three sections and the new `events` section.

`MenuItem.recipeId` is left nullable — Chunk 18 (Phase 2) attaches Recipe/BOM
through it; that logic itself is not built here.

## Adding food items in bulk (2026-10-10)

- **Names are unique per business, ignoring case.** `createMenuItem` / `updateMenuItem` throw
  `MenuItemNameTakenError`; Duplicate item becomes "X (Copy)", then "X (Copy 2)". A unique index on
  `(organizationId, lower(name))` (in migration `20261010143453_...`) backs it up.
- `import/bulk-add.ts` is the one path both bulk routes use: it skips a name that already exists (or repeats in the
  batch), finds a category by name or creates it, and reports created / skipped / failed.
- `import/import.ts` + `food-rows.ts` + `read-table.ts`: Excel (.xlsx) or CSV import (no spreadsheet library; .xlsx is
  read with fflate). Columns: Item Name, Category, Veg / Non-Veg, Price, Description (common header aliases are
  accepted). Limits: 4 MB, 1000 rows. A blank price becomes 0. `buildTemplate()` feeds
  `/menu-catalog/items/template`.
- `catalog/`: Platterly's master catalog (`SystemFoodItem`, not tenant-scoped). `catalog-data.ts` holds the dishes
  (from the Bhandary's Kitchen menus, each once); `npm run db:seed-catalog` loads them (matches by name, refreshes
  text, never deletes, keeps `isActive`). `addCatalogItems` creates an independent `MenuItem` per dish at price 0 with
  `sourceCatalogId` set (only for the "Added" badge): later edits never flow either way.
- UI: the chevron next to Add Item on Food Items (`_components/add-item-menu.tsx`).
- Not built: copying food items between kitchens, catalog images, default recipes (on hold).
