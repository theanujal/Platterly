-- CreateEnum
CREATE TYPE "EnquiryLeadSource" AS ENUM ('MANUAL_ENTRY', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'COLD_CALL', 'NETWORKING', 'OTHER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTATION_SENT', 'FOLLOW_UP', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "event_type" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "leadSource" "EnquiryLeadSource" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "customerId" TEXT,
    "eventTypeId" TEXT,
    "eventDate" TIMESTAMP(3),
    "guestCount" INTEGER,
    "venue" TEXT,
    "requirements" TEXT,
    "budget" DECIMAL(12,2),
    "preferredMenuId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "assignedKitchenId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "guestCount" INTEGER,
    "notes" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_required_inventory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_required_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_organizationId_idx" ON "customer"("organizationId");

-- CreateIndex
CREATE INDEX "enquiry_organizationId_idx" ON "enquiry"("organizationId");

-- CreateIndex
CREATE INDEX "enquiry_customerId_idx" ON "enquiry"("customerId");

-- CreateIndex
CREATE INDEX "event_organizationId_idx" ON "event"("organizationId");

-- CreateIndex
CREATE INDEX "event_customerId_idx" ON "event"("customerId");

-- CreateIndex
CREATE INDEX "event_eventTypeId_idx" ON "event"("eventTypeId");

-- CreateIndex
CREATE INDEX "event_required_inventory_eventId_idx" ON "event_required_inventory"("eventId");

-- CreateIndex
CREATE INDEX "event_required_inventory_inventoryId_idx" ON "event_required_inventory"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "event_required_inventory_eventId_inventoryId_key" ON "event_required_inventory"("eventId", "inventoryId");

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_preferredMenuId_fkey" FOREIGN KEY ("preferredMenuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_assignedKitchenId_fkey" FOREIGN KEY ("assignedKitchenId") REFERENCES "kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_required_inventory" ADD CONSTRAINT "event_required_inventory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_required_inventory" ADD CONSTRAINT "event_required_inventory_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
