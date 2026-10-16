-- CreateEnum
CREATE TYPE "AmountMode" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "discountMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "discountRate" DECIMAL(7,3) NOT NULL DEFAULT 0,
ADD COLUMN     "otherChargesMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "otherChargesRate" DECIMAL(7,3) NOT NULL DEFAULT 0;
