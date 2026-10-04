-- CreateEnum
CREATE TYPE "StaffDuty" AS ENUM ('EVENT_MANAGER', 'KITCHEN', 'SERVING', 'DELIVERY', 'SETUP', 'STORE');

-- CreateTable
CREATE TABLE "staff_member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "defaultDuty" "StaffDuty" NOT NULL DEFAULT 'SERVING',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "staffMemberId" TEXT,
    "memberId" TEXT,
    "duty" "StaffDuty" NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_member_organizationId_idx" ON "staff_member"("organizationId");

-- CreateIndex
CREATE INDEX "staff_assignment_organizationId_idx" ON "staff_assignment"("organizationId");

-- CreateIndex
CREATE INDEX "staff_assignment_eventId_idx" ON "staff_assignment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_assignment_eventId_staffMemberId_key" ON "staff_assignment"("eventId", "staffMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_assignment_eventId_memberId_key" ON "staff_assignment"("eventId", "memberId");

-- AddForeignKey
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignment" ADD CONSTRAINT "staff_assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignment" ADD CONSTRAINT "staff_assignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignment" ADD CONSTRAINT "staff_assignment_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An assignment is for exactly one person: a floor staff member or a team member with a login.
ALTER TABLE "staff_assignment" ADD CONSTRAINT "staff_assignment_one_person" CHECK (("staffMemberId" IS NOT NULL AND "memberId" IS NULL) OR ("staffMemberId" IS NULL AND "memberId" IS NOT NULL));
