-- AlterTable
ALTER TABLE "meal_plan_entry" DROP COLUMN "child5To10Count",
DROP COLUMN "childBelow5Count";

-- AlterTable
ALTER TABLE "order" DROP COLUMN "taxes",
ADD COLUMN     "individualChild5To10PricingType" "ChildPricingType",
ADD COLUMN     "individualChildBelow5PricingType" "ChildPricingType";

