-- Additive: four nullable text columns on product_billing_profile (business mobile number and order numbering), so the Account and the product edit the same fields.
ALTER TABLE "product_billing_profile" ADD COLUMN "businessPhone" TEXT,
ADD COLUMN "orderNumberPrefix" TEXT,
ADD COLUMN "orderNumberNextValue" TEXT,
ADD COLUMN "orderNumberPadding" TEXT;

-- data-safe-approved: only fills the new, empty businessPhone column from the business's own mobile number; no existing value is changed or removed.
UPDATE "product_billing_profile" p SET "businessPhone" = b."ownerPhone" FROM "business" b WHERE b."id" = p."businessId" AND p."businessPhone" IS NULL AND b."ownerPhone" IS NOT NULL;
