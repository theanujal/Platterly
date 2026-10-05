-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "subscription_payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "invoiceNumber" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "invoiceSnapshot" JSONB,
    "importedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_profile" (
    "id" TEXT NOT NULL,
    "legalName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "sacCode" TEXT NOT NULL DEFAULT '998314',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'FP',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "invoiceNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_billing_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_razorpayOrderId_key" ON "subscription_payment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_invoiceNumber_key" ON "subscription_payment"("invoiceNumber");

-- CreateIndex
CREATE INDEX "subscription_payment_businessId_createdAt_idx" ON "subscription_payment"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One running number across every business, so two businesses whose names share initials can never get the same invoice
-- number. The import raises it to catering's current value before any invoice is issued here; it never goes backwards.
CREATE SEQUENCE IF NOT EXISTS "subscription_invoice_seq" START 1 INCREMENT 1;
