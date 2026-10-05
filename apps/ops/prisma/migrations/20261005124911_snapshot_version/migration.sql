-- AlterTable
ALTER TABLE "business_product" ADD COLUMN     "snapshotIssuedAt" TIMESTAMP(3),
ADD COLUMN     "snapshotVersion" INTEGER NOT NULL DEFAULT 0;
