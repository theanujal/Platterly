-- Abandoned orders (AJ, 2026-11-14): a person who started a paid-plan sign-up and never paid. Their sign-in record is deleted when the payment window ends;
-- this one row keeps what they gave, for staff follow-up, and is deleted after 90 days. Additive: one new table, no data touched.
-- CreateTable
CREATE TABLE "abandoned_order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "productKey" TEXT NOT NULL,
    "planCode" TEXT,
    "interval" TEXT,
    "step" TEXT NOT NULL,
    "signedUpAt" TIMESTAMP(3) NOT NULL,
    "abandonedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "abandoned_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "abandoned_order_businessId_key" ON "abandoned_order"("businessId");

-- CreateIndex
CREATE INDEX "abandoned_order_status_abandonedAt_idx" ON "abandoned_order"("status", "abandonedAt");
