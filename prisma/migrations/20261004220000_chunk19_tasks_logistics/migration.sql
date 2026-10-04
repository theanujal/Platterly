-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('NOT_DISPATCHED', 'LOADING', 'DISPATCHED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "SetupStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "event_task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" DATE,
    "assignmentId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logistics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "dispatchPlannedAt" TIMESTAMP(3),
    "dispatchStatus" "DispatchStatus" NOT NULL DEFAULT 'NOT_DISPATCHED',
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "setupStatus" "SetupStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "setupTime" TIMESTAMP(3),
    "setupNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_logistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_task_organizationId_idx" ON "event_task"("organizationId");

-- CreateIndex
CREATE INDEX "event_task_eventId_idx" ON "event_task"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_logistics_eventId_key" ON "event_logistics"("eventId");

-- CreateIndex
CREATE INDEX "event_logistics_organizationId_idx" ON "event_logistics"("organizationId");

-- AddForeignKey
ALTER TABLE "event_task" ADD CONSTRAINT "event_task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_task" ADD CONSTRAINT "event_task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_task" ADD CONSTRAINT "event_task_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "staff_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logistics" ADD CONSTRAINT "event_logistics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logistics" ADD CONSTRAINT "event_logistics_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

