// Loads Platterly's master food catalog (src/modules/menus/catalog/catalog-data.ts) into system_food_item.
// Safe to run again: dishes are matched by name, text fields are refreshed, and isActive is left as it is, so a dish
// hidden from caterers stays hidden. Nothing is ever deleted. Run: npm run db:seed-catalog
import "dotenv/config";
import pg from "pg";
// @ts-expect-error Node runs .ts files directly; tsc only objects to the extension in the path.
import { CATALOG_SEED } from "../src/modules/menus/catalog/catalog-data.ts";
// @ts-expect-error Node runs .ts files directly; tsc only objects to the extension in the path.
import { catalogImage } from "../src/modules/menus/catalog/catalog-images.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL?.split("?")[0] });
try {
  const before = await pool.query("select count(*)::int as n from system_food_item");
  for (const [index, item] of CATALOG_SEED.entries()) {
    const image = catalogImage(item.name, item.categoryName);
    await pool.query(
      `insert into system_food_item (id, name, description, image, "imageCredit", "foodType", "categoryName", "sortOrder", "updatedAt")
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5::"FoodType", $6, $7, now())
       on conflict (name) do update set description = excluded.description, image = excluded.image,
         "imageCredit" = excluded."imageCredit", "foodType" = excluded."foodType",
         "categoryName" = excluded."categoryName", "sortOrder" = excluded."sortOrder", "updatedAt" = now()`,
      [item.name, item.description, image.url, image.credit, item.foodType, item.categoryName, index],
    );
  }
  const after = await pool.query("select count(*)::int as n from system_food_item");
  console.log(`Catalog: ${CATALOG_SEED.length} dishes in the file, ${before.rows[0].n} -> ${after.rows[0].n} in the database.`);
} finally {
  await pool.end();
}
