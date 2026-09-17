-- CreateEnum
CREATE TYPE "ChildPricingType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "meal_plan_entry" ADD COLUMN     "child5To10Count" INTEGER,
ADD COLUMN     "childBelow5Count" INTEGER;

-- AlterTable
ALTER TABLE "menu" ADD COLUMN     "child5To10PriceValue" DECIMAL(10,2),
ADD COLUMN     "child5To10PricingType" "ChildPricingType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "childUnder5Chargeable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "childUnder5Price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "order" DROP COLUMN "childCount",
ADD COLUMN     "child5To10Count" INTEGER,
ADD COLUMN     "childBelow5Count" INTEGER,
ADD COLUMN     "childPricingMenuId" TEXT,
ADD COLUMN     "childrenCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_childPricingMenuId_fkey" FOREIGN KEY ("childPricingMenuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

