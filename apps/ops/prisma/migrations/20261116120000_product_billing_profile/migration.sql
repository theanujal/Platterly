-- Additive: a new table, filled from the existing per-business billing_customer for each product the business uses. Nothing is removed or rewritten.
CREATE TABLE "product_billing_profile" (
    "businessId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "brandName" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "gstin" TEXT,
    "description" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_billing_profile_pkey" PRIMARY KEY ("businessId","productKey")
);
ALTER TABLE "product_billing_profile" ADD CONSTRAINT "product_billing_profile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "product_billing_profile" ("businessId","productKey","name","contactName","contactEmail","contactPhone","addressLine1","addressLine2","city","state","postalCode","country","gstin","source","updatedAt")
SELECT c."businessId", bp."productKey", c."name", c."contactName", c."contactEmail", c."contactPhone", c."addressLine1", c."addressLine2", c."city", c."state", c."postalCode", c."country", c."gstin", c."source", CURRENT_TIMESTAMP
FROM "billing_customer" c JOIN "business_product" bp ON bp."businessId" = c."businessId";
