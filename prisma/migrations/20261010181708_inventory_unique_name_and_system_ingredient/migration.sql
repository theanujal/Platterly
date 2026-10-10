-- CreateTable
CREATE TABLE "system_ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_ingredient_name_key" ON "system_ingredient"("name");

-- CreateIndex
CREATE INDEX "system_ingredient_categoryName_idx" ON "system_ingredient"("categoryName");

-- Inventory item names are unique per business and location slot, ignoring case (AJ, 2026-10-10); a null location (shared by every location) is its own slot. Prisma cannot express this expression index.
CREATE UNIQUE INDEX "inventory_organizationId_slot_lower_name_key" ON "inventory" ("organizationId", COALESCE("kitchenId", ''), lower("name"));
