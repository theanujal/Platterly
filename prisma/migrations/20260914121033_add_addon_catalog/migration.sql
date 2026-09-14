-- CreateEnum
CREATE TYPE "AddOnType" AS ENUM ('LIVE_COUNTER', 'SPECIAL_ADD_ON');

-- CreateEnum
CREATE TYPE "AddOnPriceType" AS ENUM ('PER_PLATE', 'FIXED');

-- CreateTable
CREATE TABLE "add_on" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "type" "AddOnType" NOT NULL,
    "priceType" "AddOnPriceType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_on_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "add_on_organizationId_idx" ON "add_on"("organizationId");

-- AddForeignKey
ALTER TABLE "add_on" ADD CONSTRAINT "add_on_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
