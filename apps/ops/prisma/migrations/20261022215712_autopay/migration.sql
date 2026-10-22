-- Monthly auto-pay (Razorpay Subscriptions) and a kept log of every Razorpay webhook. Additive: new nullable columns, two new
-- tables, and a unique index on the Razorpay payment id so a repeated webhook can never record one charge twice (checked: no duplicates).
-- CreateEnum
CREATE TYPE "AutoPayStatus" AS ENUM ('ACTIVE', 'PENDING', 'PAUSED', 'HALTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "autoPay" "AutoPayStatus",
ADD COLUMN     "razorpaySubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "subscription_payment" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "razorpaySubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "razorpay_event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpayOrderId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "razorpay_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_plan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_event_eventId_key" ON "razorpay_event"("eventId");

-- CreateIndex
CREATE INDEX "razorpay_event_businessId_receivedAt_idx" ON "razorpay_event"("businessId", "receivedAt");

-- CreateIndex
CREATE INDEX "razorpay_event_razorpaySubscriptionId_idx" ON "razorpay_event"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "razorpay_event_receivedAt_idx" ON "razorpay_event"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_plan_razorpayPlanId_key" ON "razorpay_plan"("razorpayPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_plan_planId_amountPaise_key" ON "razorpay_plan"("planId", "amountPaise");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_razorpaySubscriptionId_key" ON "subscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_razorpayPaymentId_key" ON "subscription_payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "subscription_payment_razorpaySubscriptionId_idx" ON "subscription_payment"("razorpaySubscriptionId");

-- AddForeignKey
ALTER TABLE "razorpay_plan" ADD CONSTRAINT "razorpay_plan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

