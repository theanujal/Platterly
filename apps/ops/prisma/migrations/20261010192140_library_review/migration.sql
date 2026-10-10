-- CreateEnum
CREATE TYPE "LibraryStatus" AS ENUM ('PENDING', 'APPROVED', 'MERGED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "libraryCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "library_candidate" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryName" TEXT,
    "foodType" TEXT,
    "unit" TEXT,
    "kitchenCount" INTEGER NOT NULL DEFAULT 0,
    "suggestedMatchId" TEXT,
    "suggestedMatchName" TEXT,
    "photoUrl" TEXT,
    "status" "LibraryStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_candidate_productKey_status_idx" ON "library_candidate"("productKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "library_candidate_productKey_remoteId_key" ON "library_candidate"("productKey", "remoteId");

-- AddForeignKey
ALTER TABLE "library_candidate" ADD CONSTRAINT "library_candidate_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE CASCADE ON UPDATE CASCADE;
