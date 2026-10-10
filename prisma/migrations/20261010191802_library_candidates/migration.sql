-- data-safe-approved: only creates new tables and adds nullable/defaulted columns; the cascading deletes are on the new library_candidate_source table, so no existing kitchen data is touched or removed.
-- CreateEnum
CREATE TYPE "LibraryCandidateKind" AS ENUM ('FOOD_ITEM', 'INGREDIENT', 'PHOTO');

-- CreateEnum
CREATE TYPE "LibraryCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'MERGED', 'REJECTED');

-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "imageSource" TEXT;

-- AlterTable
ALTER TABLE "system_food_item" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "system_ingredient" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "library_candidate" (
    "id" TEXT NOT NULL,
    "kind" "LibraryCandidateKind" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryName" TEXT,
    "foodType" "FoodType",
    "unit" TEXT,
    "photoUrl" TEXT,
    "kitchenCount" INTEGER NOT NULL DEFAULT 0,
    "status" "LibraryCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedMatchId" TEXT,
    "suggestedMatchName" TEXT,
    "mergedIntoId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_scan_run" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "candidates" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "library_scan_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_candidate_source" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_candidate_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_candidate_status_idx" ON "library_candidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "library_candidate_kind_key_key" ON "library_candidate"("kind", "key");

-- CreateIndex
CREATE INDEX "library_candidate_source_organizationId_idx" ON "library_candidate_source"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "library_candidate_source_candidateId_recordId_key" ON "library_candidate_source"("candidateId", "recordId");

-- AddForeignKey
ALTER TABLE "library_candidate_source" ADD CONSTRAINT "library_candidate_source_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "library_candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_candidate_source" ADD CONSTRAINT "library_candidate_source_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
