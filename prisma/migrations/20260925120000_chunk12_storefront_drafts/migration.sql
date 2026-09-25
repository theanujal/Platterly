-- CreateEnum
CREATE TYPE "StorefrontDraftStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterEnum
ALTER TYPE "EnquiryLeadSource" ADD VALUE 'STOREFRONT';

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "menu_selection" ADD COLUMN     "chosenMenuId" TEXT,
ADD COLUMN     "customPricePerPlate" DECIMAL(10,2),
ADD COLUMN     "isCustomMenu" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "menu_selection_item" ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "storefront_draft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "StorefrontDraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "orderId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storefront_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storefront_draft_organizationId_status_lastActivityAt_idx" ON "storefront_draft"("organizationId", "status", "lastActivityAt");

-- AddForeignKey
ALTER TABLE "menu_selection" ADD CONSTRAINT "menu_selection_chosenMenuId_fkey" FOREIGN KEY ("chosenMenuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storefront_draft" ADD CONSTRAINT "storefront_draft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storefront_draft" ADD CONSTRAINT "storefront_draft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

