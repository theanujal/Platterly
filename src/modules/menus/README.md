# menus

Owning chunk: Chunk 6 — Menu & Product Catalog.

Built:

- `category.ts` — `MenuCategory` CRUD (org-scoped, unique per-tenant name).
- `item.ts` — `MenuItem` CRUD, including the food-product toggle and
  Veg/Non-Veg + dietary-type + egg-info attributes (Updated doc §12). Soft
  deactivate only (`isActive`), never a hard delete.
- `menu.ts` — `Menu`, a named curated grouping of `MenuItem`s (many-to-many
  via `MenuMenuItem`) consumed by the Public Storefront (Chunk 8) and Menu
  Selection (Chunk 11).
- `package.ts` — `MenuPackage`, the sellable priced bundle (fixed or
  per-person, min/max guests, included/optional/add-on items) that
  Quotation/Order (Chunk 10) will actually charge against.
- `pricing.ts` — `calculatePackagePrice`, the package-pricing verify step.
  Deliberately has no `"server-only"` guard (pure math) so the Package admin
  form's live price preview can import it directly.
- `image-upload.ts` — shared 2MB PNG/JPG upload helper (Chunk 2.3's storage
  driver) for item/menu/package images.

Admin UI lives at `src/app/menu-catalog/` (Categories/Items/Menus/Packages),
gated by the `menus` permission from `src/lib/auth/permissions.ts`.

`MenuItem.recipeId` is left nullable — Chunk 18 (Phase 2) attaches Recipe/BOM
through it; that logic itself is not built here.
