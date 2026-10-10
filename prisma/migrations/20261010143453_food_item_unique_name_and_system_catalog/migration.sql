-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "sourceCatalogId" TEXT;

-- CreateTable
CREATE TABLE "system_food_item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "foodType" "FoodType" NOT NULL,
    "categoryName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_food_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_food_item_name_key" ON "system_food_item"("name");

-- CreateIndex
CREATE INDEX "system_food_item_categoryName_idx" ON "system_food_item"("categoryName");

-- Food item names are unique per business, case-insensitive (AJ, 2026-10-10). Prisma cannot express a lower() index.
CREATE UNIQUE INDEX "menu_item_organizationId_lower_name_key" ON "menu_item" ("organizationId", lower("name"));
