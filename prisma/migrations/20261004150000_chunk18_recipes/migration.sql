-- AlterTable
ALTER TABLE "menu_item" DROP COLUMN "recipeId";

-- CreateTable
CREATE TABLE "recipe" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "yieldServings" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "recipe_ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_menuItemId_key" ON "recipe"("menuItemId");

-- CreateIndex
CREATE INDEX "recipe_organizationId_idx" ON "recipe"("organizationId");

-- CreateIndex
CREATE INDEX "recipe_ingredient_inventoryId_idx" ON "recipe_ingredient"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredient_recipeId_inventoryId_key" ON "recipe_ingredient"("recipeId", "inventoryId");

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

