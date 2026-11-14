-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundEndMode" AS ENUM ('END_NOW', 'KEEP_TO_PERIOD_END');

-- AlterTable
ALTER TABLE "invoice_counter" ADD COLUMN     "lastCreditNote" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "refund_request" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "endMode" "RefundEndMode" NOT NULL,
    "razorpayRefundId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "decidedBy" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_request_paymentId_idx" ON "refund_request"("paymentId");

-- CreateIndex
CREATE INDEX "refund_request_businessId_createdAt_idx" ON "refund_request"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "refund_request_status_idx" ON "refund_request"("status");

-- At most one open request per payment
CREATE UNIQUE INDEX "refund_request_one_pending_per_payment" ON "refund_request"("paymentId") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "refund_requestId_key" ON "refund"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "refund_razorpayRefundId_key" ON "refund"("razorpayRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "refund_creditNoteNumber_key" ON "refund"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "refund_paymentId_idx" ON "refund"("paymentId");

-- AddForeignKey
ALTER TABLE "refund_request" ADD CONSTRAINT "refund_request_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "subscription_payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "refund_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "subscription_payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
