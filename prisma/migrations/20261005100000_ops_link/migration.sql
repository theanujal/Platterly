-- Ops link (docs/ops-contract.md). Additive only: one column with a default on organization (every existing row gets its own id) and three new tables.
-- CreateEnum
CREATE TYPE "OpsOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "businessId" TEXT NOT NULL DEFAULT ('biz_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text));

-- CreateTable
CREATE TABLE "ops_snapshot" (
    "businessId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_snapshot_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "ops_command" (
    "commandId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_command_pkey" PRIMARY KEY ("commandId")
);

-- CreateTable
CREATE TABLE "ops_outbox" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OpsOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ops_outbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "ops_command_receivedAt_idx" ON "ops_command"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ops_outbox_dedupeKey_key" ON "ops_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "ops_outbox_status_nextAttemptAt_idx" ON "ops_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "organization_businessId_key" ON "organization"("businessId");

