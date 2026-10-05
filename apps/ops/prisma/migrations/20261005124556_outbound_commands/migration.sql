-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "outbound_command" (
    "commandId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "response" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "outbound_command_pkey" PRIMARY KEY ("commandId")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_command_dedupeKey_key" ON "outbound_command"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbound_command_status_nextAttemptAt_idx" ON "outbound_command"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbound_command_productKey_createdAt_idx" ON "outbound_command"("productKey", "createdAt");

-- AddForeignKey
ALTER TABLE "outbound_command" ADD CONSTRAINT "outbound_command_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE CASCADE ON UPDATE CASCADE;
