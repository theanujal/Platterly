# recipes

Chunk 18.1 — one Recipe per Food Item. An Inventory item is the ingredient (no separate Ingredient table), so stock stays in one place. Quantities are for `yieldServings` servings; `recipe-math.ts` (pure, shared with the UI preview) scales them. Group 18.4 uses this to work out what a kitchen order needs, asking for approval before stock moves when the order is sent to the kitchen.
