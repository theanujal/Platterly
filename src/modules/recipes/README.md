# recipes

Chunk 18.1 — one Recipe per Food Item. An Inventory item is the ingredient (no separate Ingredient table), so stock stays in one place. Quantities are for `yieldServings` servings; `recipe-math.ts` (pure, shared with the UI preview) scales them. Group 18.4 uses this to work out what a kitchen order needs, asking for approval before stock moves when the order is sent to the kitchen.

## Add Recipe drawer: searchable ingredients and copy-then-adjust (2026-10-11)

- Ingredients are picked with `SearchableSelect` (`src/components/ui/searchable-select.tsx`): type to filter the kitchen's
  Inventory Items by name (or unit), Enter picks the first match; an ingredient already in the recipe is not offered again.
- "Copy from another dish" (Recipes page, `recipes-browser.tsx` -> `RecipeDialog` `copySources`): choosing a dish fills
  the form with its servings, ingredients, quantities and notes. **Nothing is saved until "Save recipe"**, so quantities
  can be adjusted first. This replaced the old "Copy from..." dialog, which saved the copy immediately
  (`copyRecipeAction` was removed; `copyRecipe` in `recipe.ts` stays for Duplicate item).
- The Recipe drawer opened from a Food Item card (Menu Catalog) has the searchable ingredients but no copy step; copying
  is on the Recipes page.
