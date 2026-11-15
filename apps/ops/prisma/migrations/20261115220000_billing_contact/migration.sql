-- Billing contact on a business's saved billing details (Account > Billing Details). Additive and nullable: no data is removed or rewritten.
ALTER TABLE "billing_customer" ADD COLUMN "contactName" TEXT,
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "contactPhone" TEXT;
