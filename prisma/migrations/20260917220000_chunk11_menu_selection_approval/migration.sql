-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('CLUBHOUSE', 'HOTEL', 'BANQUET_HALL', 'RESORT', 'HOME', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleAccessType" AS ENUM ('VEHICLE_AND_PARKING', 'VEHICLE_NO_PARKING', 'NO_VEHICLE_ACCESS', 'MANUAL_LOADING_REQUIRED');

-- CreateEnum
CREATE TYPE "MenuSelectionStatus" AS ENUM ('DRAFT', 'SENT_TO_CUSTOMER', 'CUSTOMER_REVIEWING', 'CHANGES_REQUESTED', 'CUSTOMER_APPROVED', 'KITCHEN_REVIEWING', 'KITCHEN_CHANGES_REQUESTED', 'KITCHEN_APPROVED', 'FINAL_LOCKED');

-- AlterEnum
BEGIN;
CREATE TYPE "SecureAccessResourceType_new" AS ENUM ('QUOTATION', 'INVOICE', 'PAYMENT_LINK');
ALTER TABLE "secure_access_token" ALTER COLUMN "resourceType" TYPE "SecureAccessResourceType_new" USING ("resourceType"::text::"SecureAccessResourceType_new");
ALTER TYPE "SecureAccessResourceType" RENAME TO "SecureAccessResourceType_old";
ALTER TYPE "SecureAccessResourceType_new" RENAME TO "SecureAccessResourceType";
DROP TYPE "public"."SecureAccessResourceType_old";
COMMIT;

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "eventMealType" "MealType",
ADD COLUMN     "liveCounterAvailable" BOOLEAN,
ADD COLUMN     "menuPreference" "FoodType",
ADD COLUMN     "vehicleAccess" "VehicleAccessType",
ADD COLUMN     "venueAccessInstructions" TEXT,
ADD COLUMN     "venueContactName" TEXT,
ADD COLUMN     "venueContactPhone" TEXT,
ADD COLUMN     "venueDoorNumber" TEXT,
ADD COLUMN     "venueFloor" TEXT,
ADD COLUMN     "venueHallName" TEXT,
ADD COLUMN     "venueLandmark" TEXT,
ADD COLUMN     "venueLatitude" DOUBLE PRECISION,
ADD COLUMN     "venueLongitude" DOUBLE PRECISION,
ADD COLUMN     "venueTower" TEXT,
ADD COLUMN     "venueType" "VenueType";

-- CreateTable
CREATE TABLE "menu_selection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "MenuSelectionStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "customerRequestNote" TEXT,
    "kitchenRequestNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_selection_item" (
    "id" TEXT NOT NULL,
    "menuSelectionId" TEXT NOT NULL,
    "itemType" "OrderItemType" NOT NULL,
    "menuId" TEXT,
    "menuItemId" TEXT,
    "addOnId" TEXT,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_selection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_version" (
    "id" TEXT NOT NULL,
    "menuSelectionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "MenuSelectionStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_version_item" (
    "id" TEXT NOT NULL,
    "menuVersionId" TEXT NOT NULL,
    "itemType" "OrderItemType" NOT NULL,
    "menuId" TEXT,
    "menuItemId" TEXT,
    "addOnId" TEXT,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_version_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_selection_eventId_key" ON "menu_selection"("eventId");

-- CreateIndex
CREATE INDEX "menu_selection_organizationId_idx" ON "menu_selection"("organizationId");

-- CreateIndex
CREATE INDEX "menu_selection_item_menuSelectionId_idx" ON "menu_selection_item"("menuSelectionId");

-- CreateIndex
CREATE INDEX "menu_version_menuSelectionId_idx" ON "menu_version"("menuSelectionId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_version_menuSelectionId_versionNumber_key" ON "menu_version"("menuSelectionId", "versionNumber");

-- CreateIndex
CREATE INDEX "menu_version_item_menuVersionId_idx" ON "menu_version_item"("menuVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_organizationId_phone_key" ON "customer"("organizationId", "phone");

-- AddForeignKey
ALTER TABLE "menu_selection" ADD CONSTRAINT "menu_selection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_selection" ADD CONSTRAINT "menu_selection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_selection_item" ADD CONSTRAINT "menu_selection_item_menuSelectionId_fkey" FOREIGN KEY ("menuSelectionId") REFERENCES "menu_selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_selection_item" ADD CONSTRAINT "menu_selection_item_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_selection_item" ADD CONSTRAINT "menu_selection_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_selection_item" ADD CONSTRAINT "menu_selection_item_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "add_on"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_version" ADD CONSTRAINT "menu_version_menuSelectionId_fkey" FOREIGN KEY ("menuSelectionId") REFERENCES "menu_selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_version_item" ADD CONSTRAINT "menu_version_item_menuVersionId_fkey" FOREIGN KEY ("menuVersionId") REFERENCES "menu_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_version_item" ADD CONSTRAINT "menu_version_item_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_version_item" ADD CONSTRAINT "menu_version_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_version_item" ADD CONSTRAINT "menu_version_item_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "add_on"("id") ON DELETE SET NULL ON UPDATE CASCADE;

