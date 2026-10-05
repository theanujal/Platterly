-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "message_log" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productKey" TEXT,
    "template" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "toEmail" TEXT,
    "subject" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "providerMessage" TEXT,
    "error" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "message_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_log_dedupeKey_key" ON "message_log"("dedupeKey");

-- CreateIndex
CREATE INDEX "message_log_businessId_createdAt_idx" ON "message_log"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "message_log_status_nextAttemptAt_idx" ON "message_log"("status", "nextAttemptAt");
