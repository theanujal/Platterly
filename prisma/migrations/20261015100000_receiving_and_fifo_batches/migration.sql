-- data-safe-approved: widening two quantity columns from 2 to 3 decimals loses nothing; new tables only; the existing on-hand stock is copied into opening batches without changing stockCount or any ledger row

-- CreateEnum
CREATE TYPE "StockBatchSource" AS ENUM ('OPENING', 'RECEIPT', 'STOCK_IN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockBatchStatus" AS ENUM ('ACTIVE', 'QUARANTINED');

-- AlterTable
ALTER TABLE "inventory" ALTER COLUMN "stockCount" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "inventory_transaction" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "invoiceNumber" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "expiryDate" DATE,
    "lotNumber" TEXT,

    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "source" "StockBatchSource" NOT NULL,
    "status" "StockBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "originalQuantity" DECIMAL(12,3) NOT NULL,
    "remainingQuantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(10,2),
    "receivedDate" DATE,
    "expiryDate" DATE,
    "lotNumber" TEXT,
    "receiptLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_allocation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "batchId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(10,2),

    CONSTRAINT "stock_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goods_receipt_organizationId_idx" ON "goods_receipt"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_purchaseOrderId_idempotencyKey_key" ON "goods_receipt"("purchaseOrderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "goods_receipt_line_purchaseOrderItemId_idx" ON "goods_receipt_line"("purchaseOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batch_receiptLineId_key" ON "stock_batch"("receiptLineId");

-- CreateIndex
CREATE INDEX "stock_batch_inventoryId_remainingQuantity_idx" ON "stock_batch"("inventoryId", "remainingQuantity");

-- CreateIndex
CREATE INDEX "stock_batch_organizationId_idx" ON "stock_batch"("organizationId");

-- CreateIndex
CREATE INDEX "stock_allocation_transactionId_idx" ON "stock_allocation"("transactionId");

-- CreateIndex
CREATE INDEX "stock_allocation_batchId_idx" ON "stock_allocation"("batchId");

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "goods_receipt_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocation" ADD CONSTRAINT "stock_allocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "inventory_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocation" ADD CONSTRAINT "stock_allocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing stock -> one opening batch per item that has stock, so every on-hand unit is in exactly one batch and
-- sum(batch.remainingQuantity) = inventory.stockCount for every item.
-- Nothing is invented: unitCost is the item's own recorded cost (null if it has none), expiryDate is the item's own recorded
-- expiry date (null if none), and receivedDate is left null because it was never recorded. The batch is marked OPENING so
-- screens can say its price and date are not from a delivery. The older ledger rows get no allocations (what those past
-- consumptions cost is not known) and are left as they are.
INSERT INTO "stock_batch" ("id", "organizationId", "inventoryId", "source", "status", "originalQuantity", "remainingQuantity", "unitCost", "receivedDate", "expiryDate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, i."organizationId", i."id", 'OPENING', 'ACTIVE', i."stockCount", i."stockCount", i."costPerUnit", NULL, i."expiryDate"::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "inventory" i
WHERE i."stockCount" > 0;
