-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "slugChangeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "subscription_plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialDurationDays" INTEGER,
    "priceMonthly" DECIMAL(10,2),
    "priceAnnual" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "maxUsers" INTEGER,
    "maxEvents" INTEGER,
    "maxOrders" INTEGER,
    "maxKitchens" INTEGER,
    "maxStores" INTEGER,
    "maxCustomers" INTEGER,
    "maxMenuLinks" INTEGER,
    "maxStorageMb" INTEGER,
    "maxReports" INTEGER,
    "maxWhatsappMessages" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionPlanId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_code_key" ON "subscription_plan"("code");

-- CreateIndex
CREATE INDEX "subscription_organizationId_idx" ON "subscription"("organizationId");

-- CreateIndex
CREATE INDEX "subscription_organizationId_status_idx" ON "subscription"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "subscription_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
