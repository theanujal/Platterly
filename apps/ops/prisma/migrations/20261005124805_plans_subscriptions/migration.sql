-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'LOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialDurationDays" INTEGER,
    "priceMonthly" DECIMAL(10,2),
    "priceAnnual" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entitlements" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "billingInterval" "BillingInterval",
    "currentPeriodEnd" TIMESTAMP(3),
    "pendingPlanId" TEXT,
    "pendingInterval" "BillingInterval",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_productKey_code_key" ON "plan"("productKey", "code");

-- CreateIndex
CREATE INDEX "subscription_businessId_productKey_idx" ON "subscription"("businessId", "productKey");

-- CreateIndex
CREATE INDEX "subscription_planId_idx" ON "subscription"("planId");

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one current subscription (no endDate) per business and product. Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "subscription_one_current_per_product" ON "subscription" ("businessId", "productKey") WHERE "endDate" IS NULL;
