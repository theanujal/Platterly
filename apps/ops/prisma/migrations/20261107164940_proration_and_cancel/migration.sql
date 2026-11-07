-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscription_payment" ADD COLUMN     "creditAmount" DECIMAL(10,2);
