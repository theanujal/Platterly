-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disabledReason" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_idempotency_key" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_prefix_key" ON "api_key"("prefix");

-- CreateIndex
CREATE INDEX "api_key_organizationId_idx" ON "api_key"("organizationId");

-- CreateIndex
CREATE INDEX "webhook_endpoint_organizationId_idx" ON "webhook_endpoint"("organizationId");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "webhook_delivery_organizationId_createdAt_idx" ON "webhook_delivery"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_endpointId_eventId_key" ON "webhook_delivery"("endpointId", "eventId");

-- CreateIndex
CREATE INDEX "api_idempotency_key_createdAt_idx" ON "api_idempotency_key"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_key_organizationId_key_key" ON "api_idempotency_key"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_idempotency_key" ADD CONSTRAINT "api_idempotency_key_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
