# library

A library that learns from kitchens (AJ, 2026-10-11). Platterly's master lists (`SystemFoodItem`, `SystemIngredient`) grow from what
kitchens add, with a person approving every change in Platterly Ops. **Recipes are never collected.**

- `match.ts`: pure name matching. `normalizeName` (case, brackets, spellings like Panner/Paneer, plurals, word order), `findLibraryMatch`
  (exact against names and aliases, else a "close" hint), `isJunkName`.
- `scan.ts`: `runLibraryScan` groups kitchens' own items (food items without `sourceCatalogId`, all inventory) by name, skips what the
  library has, and keeps a `LibraryCandidate` once `MIN_KITCHENS` (2) different kitchens have it. `runLibraryScanIfDue` (called from the
  cron route) runs it about once a day (`LibraryScanRun`). Idempotent; a decided candidate is never reopened.
- `apply.ts`: `candidatesForOps` (names, category, type, unit and counts only) and `applyDecision` (approve / merge / reject; safe to
  repeat). Never touches a kitchen's own items.
- Routes: `GET /api/ops/library/candidates`, `POST /api/ops/library/decisions` (signed, `docs/ops-contract.md` section 30).
- Review happens in Ops: `apps/ops/src/modules/library`, page `/library`.
- Kitchen records behind a candidate: `LibraryCandidateSource` (stays in catering; removed with the kitchen's data).
- `entries.ts`: `listEntries` / `updateEntry` for the Ops editor (route `/api/ops/library/entries`, contract section 31). A rename keeps the old name as an alias; an edited entry gets `editedInOps`, which the catalog seed respects. Hide = `isActive: false`.
- Editing happens in Ops at `/library/entries` (read live, no copy kept).
- Photos: `scanPhotos` (in `scan.ts`) offers a kitchen's own upload (`MenuItem.imageSource = "upload"`, set when the kitchen uploads, `"library"` when copied from the catalog) for a library dish that has only an illustration (`imageCredit` null), exact name or other name only; `applyPhoto` (in `apply.ts`) copies the file to `library/dishes/`, sets image + credit, flags `editedInOps`. `LIBRARY_PHOTO_MIN_KITCHENS` (default 1). Ops tab "Photos" needs a confirmation tick.
- Categories: the library has its own list (`SystemFoodCategory`, name + other names). `scanCategories` offers category names 2+ kitchens use that the list lacks (kind `CATEGORY`); `applyCategory` approves one as new or merges it as another name. A dish's category must be one of the list (`findLibraryCategory`, spelling-tolerant, in `categories.ts`); renaming a category in Ops moves its library dishes. Contract sections 31 and 32.
- Merge: a reviewer may merge a candidate into any library item of its kind (hidden ones too), typed by name in Ops; the "looks like" item is only a shortcut. `applyDecision` already takes any `mergeIntoId` and refuses another kind (404).
