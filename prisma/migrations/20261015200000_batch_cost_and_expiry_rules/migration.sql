-- data-safe-approved: adds columns only; the one UPDATE changes opening batches' cost to "unknown" (null), which is the stated rule (an item's current cost is not a verified cost for its opening stock); quantities, dates and the ledger are untouched, and tracksExpiry is a setting backfilled from the category rule that was already being enforced

-- AlterTable
ALTER TABLE "goods_receipt_line" ADD COLUMN     "costNote" TEXT,
ADD COLUMN     "extraQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "extraReason" TEXT;

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "tracksExpiry" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_batch" ADD COLUMN     "costNote" TEXT;


-- Opening stock: its cost is not verified. Whatever the first migration copied from the item's own cost is cleared, so the
-- batch says "cost unknown" until a person confirms a cost (Batches -> Confirm cost). Quantity, received date and expiry stay as they were.
UPDATE "stock_batch" SET "unitCost" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "source" = 'OPENING' AND "unitCost" IS NOT NULL;

-- Tracks expiry: the category rule that receiving already enforced becomes each item's own setting. No dates are created.
UPDATE "inventory" SET "tracksExpiry" = true WHERE "category" IN ('Dairy', 'Vegetables', 'Fruits', 'Meat & Poultry', 'Seafood');
