/*
  Warnings:

  - You are about to drop the column `sortOrder` on the `menu_category` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `menu_item` table. All the data in the column will be lost.
  - You are about to drop the column `dietaryType` on the `menu_item` table. All the data in the column will be lost.
  - You are about to drop the column `eggInfo` on the `menu_item` table. All the data in the column will be lost.
  - You are about to drop the column `isFoodProduct` on the `menu_item` table. All the data in the column will be lost.
  - You are about to drop the `menu_package` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `menu_package_item` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `menuType` to the `menu` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricePerPlate` to the `menu` table without a default value. This is not possible if the table is not empty.
  - Made the column `foodType` on table `menu_item` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "menu_item" DROP CONSTRAINT "menu_item_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "menu_package" DROP CONSTRAINT "menu_package_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "menu_package_item" DROP CONSTRAINT "menu_package_item_menuItemId_fkey";

-- DropForeignKey
ALTER TABLE "menu_package_item" DROP CONSTRAINT "menu_package_item_packageId_fkey";

-- DropIndex
DROP INDEX "menu_item_categoryId_idx";

-- AlterTable
ALTER TABLE "menu" ADD COLUMN     "menuType" "FoodType" NOT NULL,
ADD COLUMN     "pricePerPlate" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "menu_category" DROP COLUMN "sortOrder",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "menu_item" DROP COLUMN "categoryId",
DROP COLUMN "dietaryType",
DROP COLUMN "eggInfo",
DROP COLUMN "isFoodProduct",
ALTER COLUMN "foodType" SET NOT NULL;

-- DropTable
DROP TABLE "menu_package";

-- DropTable
DROP TABLE "menu_package_item";

-- DropEnum
DROP TYPE "DietaryType";

-- DropEnum
DROP TYPE "EggInfo";

-- DropEnum
DROP TYPE "PackagePricingModel";

-- CreateTable
CREATE TABLE "menu_item_category" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_category_assignment" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "maxSelection" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_category_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_type" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "minGuests" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_type_menu" (
    "id" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_type_menu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_item_category_menuItemId_idx" ON "menu_item_category"("menuItemId");

-- CreateIndex
CREATE INDEX "menu_item_category_categoryId_idx" ON "menu_item_category"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_category_menuItemId_categoryId_key" ON "menu_item_category"("menuItemId", "categoryId");

-- CreateIndex
CREATE INDEX "menu_category_assignment_menuId_idx" ON "menu_category_assignment"("menuId");

-- CreateIndex
CREATE INDEX "menu_category_assignment_categoryId_idx" ON "menu_category_assignment"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_category_assignment_menuId_categoryId_key" ON "menu_category_assignment"("menuId", "categoryId");

-- CreateIndex
CREATE INDEX "event_type_organizationId_idx" ON "event_type"("organizationId");

-- CreateIndex
CREATE INDEX "event_type_menu_eventTypeId_idx" ON "event_type_menu"("eventTypeId");

-- CreateIndex
CREATE INDEX "event_type_menu_menuId_idx" ON "event_type_menu"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "event_type_menu_eventTypeId_menuId_key" ON "event_type_menu"("eventTypeId", "menuId");

-- AddForeignKey
ALTER TABLE "menu_item_category" ADD CONSTRAINT "menu_item_category_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_category" ADD CONSTRAINT "menu_item_category_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_category_assignment" ADD CONSTRAINT "menu_category_assignment_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_category_assignment" ADD CONSTRAINT "menu_category_assignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_type_menu" ADD CONSTRAINT "event_type_menu_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_type_menu" ADD CONSTRAINT "event_type_menu_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
