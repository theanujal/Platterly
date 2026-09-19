-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('STANDARD', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "cookingInstructions" TEXT,
ADD COLUMN     "deliveryInstructions" TEXT,
ADD COLUMN     "gasElectricAvailable" BOOLEAN,
ADD COLUMN     "individualAdultRate" DECIMAL(12,2),
ADD COLUMN     "individualChild5To10Rate" DECIMAL(12,2),
ADD COLUMN     "individualChildBelow5Rate" DECIMAL(12,2),
ADD COLUMN     "kitchenNotes" TEXT,
ADD COLUMN     "otherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pricingMethod" "PricingMethod" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "transportationCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
