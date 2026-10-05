-- Ops link: a snapshot is found by the kitchen's id with one indexed lookup. Additive (one nullable column and its index).
-- AlterTable
ALTER TABLE "ops_snapshot" ADD COLUMN     "organizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ops_snapshot_organizationId_key" ON "ops_snapshot"("organizationId");

