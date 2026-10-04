-- CreateEnum
CREATE TYPE "VisitSource" AS ENUM ('GOOGLE', 'OTHER_SEARCH', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'QR', 'EMAIL', 'EMBED', 'REFERRAL', 'CAMPAIGN', 'DIRECT');

-- CreateEnum
CREATE TYPE "VisitDevice" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP');

-- AlterTable
ALTER TABLE "storefront_draft" ADD COLUMN     "visitId" TEXT;

-- CreateTable
CREATE TABLE "storefront_visit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "VisitSource" NOT NULL,
    "sourceDetail" TEXT,
    "device" "VisitDevice" NOT NULL,
    "browser" TEXT,
    "country" TEXT,
    "city" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "visitorKey" TEXT NOT NULL,

    CONSTRAINT "storefront_visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storefront_visit_organizationId_visitedAt_idx" ON "storefront_visit"("organizationId", "visitedAt");

-- CreateIndex
CREATE INDEX "storefront_visit_organizationId_visitorKey_idx" ON "storefront_visit"("organizationId", "visitorKey");

-- AddForeignKey
ALTER TABLE "storefront_visit" ADD CONSTRAINT "storefront_visit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

