-- data-safe-approved: order_event_venue was added one step earlier and nothing has been released; the table is empty, only its key changes (per meal slot, not per day)
-- DropIndex
DROP INDEX "order_event_venue_orderId_date_key";

-- AlterTable
ALTER TABLE "order_event_venue" ADD COLUMN     "mealType" "MealType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "order_event_venue_orderId_date_mealType_key" ON "order_event_venue"("orderId", "date", "mealType");
