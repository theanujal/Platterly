-- data-safe-approved: new table only; its cascades remove a mapping together with its supplier or inventory item (suppliers in use are refused by deleteSupplier), and nothing existing is changed or removed

-- CreateTable
CREATE TABLE "supplier_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_item_inventoryId_idx" ON "supplier_item"("inventoryId");

-- CreateIndex
CREATE INDEX "supplier_item_organizationId_idx" ON "supplier_item"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_item_supplierId_inventoryId_key" ON "supplier_item"("supplierId", "inventoryId");

-- AddForeignKey
ALTER TABLE "supplier_item" ADD CONSTRAINT "supplier_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_item" ADD CONSTRAINT "supplier_item_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_item" ADD CONSTRAINT "supplier_item_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one preferred supplier per inventory item (an item belongs to exactly one kitchen, so this is per kitchen).
-- Prisma cannot declare a partial index, so it lives here only.
CREATE UNIQUE INDEX "supplier_item_one_preferred_per_inventory" ON "supplier_item"("inventoryId") WHERE "isPreferred";
