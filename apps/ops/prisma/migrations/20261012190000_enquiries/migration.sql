-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "enquiry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "businessType" TEXT,
    "subject" TEXT,
    "message" TEXT,
    "page" TEXT,
    "source" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiry_status_createdAt_idx" ON "enquiry"("status", "createdAt");

