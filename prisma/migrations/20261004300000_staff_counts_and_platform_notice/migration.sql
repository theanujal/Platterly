-- data-safe-approved: purely additive (one nullable column, two new tables). The cascades are on the new child table only and mean its counts go when their own event or kitchen is deleted, like EventTask.

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "staffingNotes" TEXT;

-- CreateTable
CREATE TABLE "event_staff_count" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "duty" "StaffDuty" NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_staff_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_notice" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "message" TEXT,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_staff_count_organizationId_idx" ON "event_staff_count"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "event_staff_count_eventId_duty_key" ON "event_staff_count"("eventId", "duty");

-- AddForeignKey
ALTER TABLE "event_staff_count" ADD CONSTRAINT "event_staff_count_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_staff_count" ADD CONSTRAINT "event_staff_count_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
