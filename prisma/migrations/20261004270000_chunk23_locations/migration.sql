-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "kitchenId" TEXT;

-- AlterTable
ALTER TABLE "member" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "subscription_plan" ADD COLUMN     "multiLocation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "inventory_kitchenId_idx" ON "inventory"("kitchenId");

-- CreateIndex
CREATE INDEX "member_locationId_idx" ON "member"("locationId");

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
