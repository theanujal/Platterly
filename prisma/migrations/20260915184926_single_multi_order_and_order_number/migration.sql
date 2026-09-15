-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('SINGLE', 'MULTI');

-- AlterTable
ALTER TABLE "meal_plan_entry" ADD COLUMN     "menuId" TEXT;

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "orderKind" "OrderKind" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "orderNumber" TEXT;

-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "mealPlanEntryId" TEXT;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "orderNumberNextValue" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "orderNumberPadding" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "orderNumberPrefix" TEXT NOT NULL DEFAULT 'ORD';

-- CreateIndex
CREATE UNIQUE INDEX "order_organizationId_orderNumber_key" ON "order"("organizationId", "orderNumber");

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_mealPlanEntryId_fkey" FOREIGN KEY ("mealPlanEntryId") REFERENCES "meal_plan_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entry" ADD CONSTRAINT "meal_plan_entry_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

