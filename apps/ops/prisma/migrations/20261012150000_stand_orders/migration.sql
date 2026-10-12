-- CreateEnum
CREATE TYPE "StandFulfilment" AS ENUM ('PLACED', 'PRINTING', 'SHIPPED', 'DELIVERED');

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "standGstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN     "standPrice" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "stand_order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "invoiceNumber" TEXT,
    "invoiceSnapshot" JSONB,
    "paidAt" TIMESTAMP(3),
    "fulfilment" "StandFulfilment" NOT NULL DEFAULT 'PLACED',
    "printingAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "trackingNote" TEXT,
    "shipTo" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "kitchenName" TEXT NOT NULL,
    "kitchenLogoUrl" TEXT,
    "linkUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stand_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stand_order_razorpayOrderId_key" ON "stand_order"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "stand_order_invoiceNumber_key" ON "stand_order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "stand_order_businessId_createdAt_idx" ON "stand_order"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "stand_order_paymentStatus_fulfilment_idx" ON "stand_order"("paymentStatus", "fulfilment");

-- AddForeignKey
ALTER TABLE "stand_order" ADD CONSTRAINT "stand_order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

