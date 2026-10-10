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
- Not built yet: photo candidates (`imageSource` is recorded for it), kitchen categories, a screen to edit existing library entries.
