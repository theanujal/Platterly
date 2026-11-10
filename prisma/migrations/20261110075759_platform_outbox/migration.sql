-- CreateTable
CREATE TABLE "platform_outbox" (
    "messageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OpsOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "platform_outbox_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE INDEX "platform_outbox_status_nextAttemptAt_idx" ON "platform_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_outbox_type_businessId_key" ON "platform_outbox"("type", "businessId");
