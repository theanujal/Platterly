-- data-safe-approved: new table only; the cascade removes a venue row with its own order, nothing existing is touched
-- AlterTable
ALTER TABLE "order" ADD COLUMN     "venuePerEvent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "order_event_venue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venueType" "VenueType" NOT NULL,
    "venue" TEXT NOT NULL,
    "venueDoorNumber" TEXT,
    "venueTower" TEXT,
    "venueFloor" TEXT,
    "eventAddress" TEXT NOT NULL,
    "venueLandmark" TEXT,
    "venueContactName" TEXT NOT NULL,
    "venueContactPhone" TEXT NOT NULL,
    "venueAccessInstructions" TEXT,
    "cookingInstructions" TEXT,
    "gasElectricAvailable" BOOLEAN NOT NULL DEFAULT false,
    "liveCounterAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_event_venue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_event_venue_orderId_date_key" ON "order_event_venue"("orderId", "date");

-- AddForeignKey
ALTER TABLE "order_event_venue" ADD CONSTRAINT "order_event_venue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
