-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "billingInterval" "BillingInterval",
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "pendingInterval" "BillingInterval",
ADD COLUMN     "pendingPlanId" TEXT;

-- AlterTable
ALTER TABLE "subscription_plan" ADD COLUMN     "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "subscription_payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionPlanId" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "invoiceNumber" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_razorpayOrderId_key" ON "subscription_payment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_invoiceNumber_key" ON "subscription_payment"("invoiceNumber");

-- CreateIndex
CREATE INDEX "subscription_payment_organizationId_createdAt_idx" ON "subscription_payment"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "subscription_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Gap-tolerant running number for GST invoices (SUB-<year>-<number>).
CREATE SEQUENCE IF NOT EXISTS "subscription_invoice_seq";
