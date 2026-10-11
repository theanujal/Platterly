-- Read-only. Run on production BEFORE `prisma migrate deploy` brings in the unique-name indexes:
--   psql "$DATABASE_URL" -f scripts/pre-migrate-duplicate-check.sql
-- Both queries must return zero rows. Any row is a name that would make the migration fail;
-- rename or merge those items first (with the kitchen's knowledge), then run the migration.

-- Food items: unique per business, case-insensitive (migration 20261010143453)
SELECT "organizationId", lower(name) AS name, count(*) AS copies, array_agg(id) AS ids
FROM menu_item
GROUP BY "organizationId", lower(name)
HAVING count(*) > 1;

-- Inventory items: unique per business and location slot, case-insensitive (migration 20261010181708)
SELECT "organizationId", COALESCE("kitchenId", '') AS slot, lower(name) AS name, count(*) AS copies, array_agg(id) AS ids
FROM inventory
GROUP BY "organizationId", COALESCE("kitchenId", ''), lower(name)
HAVING count(*) > 1;
