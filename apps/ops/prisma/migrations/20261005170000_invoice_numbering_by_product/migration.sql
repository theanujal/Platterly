-- AlterTable
ALTER TABLE "product" ADD COLUMN     "invoicePrefix" TEXT;

-- CreateTable
CREATE TABLE "invoice_counter" (
    "productKey" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counter_pkey" PRIMARY KEY ("productKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_invoicePrefix_key" ON "product"("invoicePrefix");

-- AddForeignKey
ALTER TABLE "invoice_counter" ADD CONSTRAINT "invoice_counter_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE CASCADE ON UPDATE CASCADE;


-- Numbering follows the product. The old single sequence (subscription_invoice_seq) is kept untouched for rollback; it is no
-- longer used. Catering carries on from the number it had reached, so no issued invoice is renumbered or repeated and the
-- format does not change (it keeps the seller profile's current prefix). Every other existing product starts at 0.
UPDATE "product" SET "invoicePrefix" = COALESCE((SELECT "invoicePrefix" FROM "platform_billing_profile" WHERE "id" = 'platform'), 'FP') WHERE "key" = 'catering';

INSERT INTO "invoice_counter" ("productKey", "lastNumber")
SELECT p."key",
       CASE WHEN p."key" = 'catering'
            THEN (SELECT CASE WHEN "is_called" THEN "last_value" ELSE "last_value" - 1 END FROM "subscription_invoice_seq")::integer
            ELSE 0 END
FROM "product" p;
