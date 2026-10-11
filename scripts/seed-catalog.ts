// Loads Platterly's master catalogs into system_food_item (src/modules/menus/catalog/catalog-data.ts) and
// system_ingredient (src/modules/inventory/catalog/ingredient-data.ts).
// Safe to run again: dishes are matched by name, text fields are refreshed, and isActive is left as it is, so a dish
// hidden from caterers stays hidden. Entries a person edited in Ops (editedInOps) are left exactly as they are, and a name that
// now lives on as another entry's alias (after a rename in Ops) is not inserted again. Nothing is ever deleted. Run: npm run db:seed-catalog
import "dotenv/config";
import pg from "pg";
// @ts-expect-error Node runs .ts files directly; tsc only objects to the extension in the path.
import { CATALOG_SEED } from "../src/modules/menus/catalog/catalog-data.ts";
// @ts-expect-error Node runs .ts files directly; tsc only objects to the extension in the path.
import { catalogImage } from "../src/modules/menus/catalog/catalog-images.ts";
// @ts-expect-error Node runs .ts files directly; tsc only objects to the extension in the path.
import { INGREDIENT_SEED } from "../src/modules/inventory/catalog/ingredient-data.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL?.split("?")[0] });
try {
  const before = await pool.query("select count(*)::int as n from system_food_item");
  for (const [index, item] of CATALOG_SEED.entries()) {
    const image = catalogImage(item.name, item.categoryName);
    await pool.query(
      `insert into system_food_item (id, name, description, image, "imageCredit", "foodType", "categoryName", "sortOrder", "updatedAt")
       select gen_random_uuid()::text, $1, $2, $3, $4, $5::"FoodType", $6, $7, now()
       where not exists (select 1 from system_food_item where $1 = any(aliases))
       on conflict (name) do update set description = excluded.description, image = excluded.image,
         "imageCredit" = excluded."imageCredit", "foodType" = excluded."foodType",
         "categoryName" = excluded."categoryName", "sortOrder" = excluded."sortOrder", "updatedAt" = now()
       where not system_food_item."editedInOps"`,
      [item.name, item.description, image.url, image.credit, item.foodType, item.categoryName, index],
    );
  }
  // Every category a catalog dish uses is a library category (existing ones, and any a person added in Ops, are left as they are).
  const categoryNames = [...new Set((CATALOG_SEED as { categoryName: string }[]).map((i) => i.categoryName))];
  await pool.query(
    `insert into system_food_category (id, name, "sortOrder", "updatedAt")
     select gen_random_uuid()::text, n, 1000 + row_number() over (order by n), now() from unnest($1::text[]) as n
     where not exists (select 1 from system_food_category c where c.name = n or n = any(c.aliases))
     on conflict (name) do nothing`,
    [categoryNames],
  );
  const after = await pool.query("select count(*)::int as n from system_food_item");
  console.log(`Catalog: ${CATALOG_SEED.length} dishes in the file, ${before.rows[0].n} -> ${after.rows[0].n} in the database.`);

  const ingredientsBefore = await pool.query("select count(*)::int as n from system_ingredient");
  for (const [index, item] of INGREDIENT_SEED.entries()) {
    await pool.query(
      `insert into system_ingredient (id, name, "categoryName", unit, "sortOrder", "updatedAt")
       select gen_random_uuid()::text, $1, $2, $3, $4, now()
       where not exists (select 1 from system_ingredient where $1 = any(aliases))
       on conflict (name) do update set "categoryName" = excluded."categoryName", unit = excluded.unit,
         "sortOrder" = excluded."sortOrder", "updatedAt" = now()
       where not system_ingredient."editedInOps"`,
      [item.name, item.categoryName, item.unit, index],
    );
  }
  const ingredientsAfter = await pool.query("select count(*)::int as n from system_ingredient");
  console.log(`Ingredients: ${INGREDIENT_SEED.length} in the file, ${ingredientsBefore.rows[0].n} -> ${ingredientsAfter.rows[0].n} in the database.`);
} finally {
  await pool.end();
}
