-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "kitchenId" TEXT;

-- CreateIndex
CREATE INDEX "purchase_order_kitchenId_idx" ON "purchase_order"("kitchenId");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
