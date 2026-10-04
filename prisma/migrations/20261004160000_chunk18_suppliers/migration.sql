-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "recurring_expense" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_organizationId_name_key" ON "supplier"("organizationId", "name");


-- Backfill: one Supplier per distinct trimmed name per kitchen, taken from inventory items, expenses and
-- repeating expenses (case-insensitive, first spelling wins); inventory's contact text becomes the phone.
INSERT INTO "supplier" ("id", "organizationId", "name", "phone", "updatedAt")
SELECT gen_random_uuid()::text, n."organizationId", n."name", c."contact", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("organizationId", lower(btrim("supplierName"))) "organizationId", btrim("supplierName") AS "name"
  FROM (
    SELECT "organizationId", "supplierName" FROM "inventory" WHERE btrim(coalesce("supplierName", '')) <> ''
    UNION ALL SELECT "organizationId", "supplierName" FROM "expense" WHERE btrim(coalesce("supplierName", '')) <> ''
    UNION ALL SELECT "organizationId", "supplierName" FROM "recurring_expense" WHERE btrim(coalesce("supplierName", '')) <> ''
  ) all_names
  ORDER BY "organizationId", lower(btrim("supplierName")), btrim("supplierName")
) n
LEFT JOIN LATERAL (
  SELECT NULLIF(btrim("supplierContact"), '') AS "contact" FROM "inventory" i
  WHERE i."organizationId" = n."organizationId" AND lower(btrim(i."supplierName")) = lower(n."name") AND NULLIF(btrim(i."supplierContact"), '') IS NOT NULL
  LIMIT 1
) c ON true;

UPDATE "inventory" i SET "supplierId" = s."id" FROM "supplier" s
WHERE s."organizationId" = i."organizationId" AND lower(s."name") = lower(btrim(i."supplierName"));
UPDATE "expense" e SET "supplierId" = s."id" FROM "supplier" s
WHERE s."organizationId" = e."organizationId" AND lower(s."name") = lower(btrim(e."supplierName"));
UPDATE "recurring_expense" r SET "supplierId" = s."id" FROM "supplier" s
WHERE s."organizationId" = r."organizationId" AND lower(s."name") = lower(btrim(r."supplierName"));

ALTER TABLE "inventory" DROP COLUMN "supplierContact", DROP COLUMN "supplierName";

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense" ADD CONSTRAINT "recurring_expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

