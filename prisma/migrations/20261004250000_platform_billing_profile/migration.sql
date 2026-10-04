-- AlterTable
ALTER TABLE "subscription_payment" ADD COLUMN     "invoiceSnapshot" JSONB;

-- CreateTable
CREATE TABLE "platform_billing_profile" (
    "id" TEXT NOT NULL,
    "legalName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "sacCode" TEXT NOT NULL DEFAULT '998314',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'FP',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "invoiceNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_billing_profile_pkey" PRIMARY KEY ("id")
);

