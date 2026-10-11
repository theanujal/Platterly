-- data-safe-approved: adds a new enum value and a new table, and fills the new table from the category names the library's dishes already use; no existing row is changed or removed.
-- AlterEnum
ALTER TYPE "LibraryCandidateKind" ADD VALUE 'CATEGORY';

-- CreateTable
CREATE TABLE "system_food_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_food_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_food_category_name_key" ON "system_food_category"("name");

-- The categories the library has today: the standard list plus any name a library dish already uses.
INSERT INTO "system_food_category" ("id", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, n.name, n.ord, now()
FROM (VALUES ('Starters', 1), ('Main Course', 2), ('Breads', 3), ('Rice & Biryani', 4), ('Desserts', 5), ('Beverages', 6), ('Salads & Accompaniments', 7), ('Soups', 8), ('Breakfast', 9), ('Live Counters', 10)) AS n(name, ord);

INSERT INTO "system_food_category" ("id", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, d."categoryName", 100 + (row_number() OVER (ORDER BY d."categoryName"))::int, now()
FROM (SELECT DISTINCT "categoryName" FROM "system_food_item") d
WHERE d."categoryName" NOT IN (SELECT "name" FROM "system_food_category");
