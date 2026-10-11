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
- Not built yet: photo candidates (`imageSource` is recorded for it), kitchen categories as library categories.
- Merge: a reviewer may merge a candidate into any library item of its kind (hidden ones too), typed by name in Ops; the "looks like" item is only a shortcut. `applyDecision` already takes any `mergeIntoId` and refuses another kind (404).
