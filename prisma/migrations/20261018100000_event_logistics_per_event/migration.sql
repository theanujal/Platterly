-- data-safe-approved: no data is removed or rewritten; the new slotKey column defaults to the empty key every existing row already is (one row per event), and the one-row-per-event unique index is replaced by one per event and slot, which those rows satisfy

-- DropIndex
DROP INDEX "event_logistics_eventId_key";

-- AlterTable
ALTER TABLE "event_logistics" ADD COLUMN     "slotKey" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "event_logistics_eventId_slotKey_key" ON "event_logistics"("eventId", "slotKey");

