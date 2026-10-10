-- data-safe-approved: AJ removed the public API and webhooks on 2026-10-10; no kitchen used them
/*
  Warnings:

  - You are about to drop the `api_idempotency_key` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `api_key` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `webhook_delivery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `webhook_endpoint` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "api_idempotency_key" DROP CONSTRAINT "api_idempotency_key_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "api_key" DROP CONSTRAINT "api_key_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "webhook_delivery" DROP CONSTRAINT "webhook_delivery_endpointId_fkey";

-- DropForeignKey
ALTER TABLE "webhook_delivery" DROP CONSTRAINT "webhook_delivery_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "webhook_endpoint" DROP CONSTRAINT "webhook_endpoint_organizationId_fkey";

-- DropTable
DROP TABLE "api_idempotency_key";

-- DropTable
DROP TABLE "api_key";

-- DropTable
DROP TABLE "webhook_delivery";

-- DropTable
DROP TABLE "webhook_endpoint";

-- DropEnum
DROP TYPE "WebhookDeliveryStatus";
