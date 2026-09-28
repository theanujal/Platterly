-- AlterTable
ALTER TABLE "quotation" ADD COLUMN     "adultCount" INTEGER,
ADD COLUMN     "child5To10Count" INTEGER,
ADD COLUMN     "childBelow5Count" INTEGER,
ADD COLUMN     "childPricingMenuId" TEXT,
ADD COLUMN     "childrenCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "individualChild5To10PricingType" "ChildPricingType",
ADD COLUMN     "individualChild5To10Rate" DECIMAL(12,2),
ADD COLUMN     "individualChildBelow5PricingType" "ChildPricingType",
ADD COLUMN     "individualChildBelow5Rate" DECIMAL(12,2),
ADD COLUMN     "individualPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "menuPreference" "FoodType",
ADD COLUMN     "orderKind" "OrderKind" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "pricingMethod" "PricingMethod" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "totalParticipants" INTEGER;

-- AlterTable
ALTER TABLE "quotation_item" ADD COLUMN     "mealPlanEntryId" TEXT;

-- CreateTable
CREATE TABLE "quotation_meal_plan_entry" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealType" "MealType" NOT NULL,
    "price" DECIMAL(10,2),
    "menuId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_meal_plan_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_meal_plan_entry_quotationId_idx" ON "quotation_meal_plan_entry"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_meal_plan_entry_quotationId_date_mealType_key" ON "quotation_meal_plan_entry"("quotationId", "date", "mealType");

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_childPricingMenuId_fkey" FOREIGN KEY ("childPricingMenuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_item" ADD CONSTRAINT "quotation_item_mealPlanEntryId_fkey" FOREIGN KEY ("mealPlanEntryId") REFERENCES "quotation_meal_plan_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_meal_plan_entry" ADD CONSTRAINT "quotation_meal_plan_entry_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_meal_plan_entry" ADD CONSTRAINT "quotation_meal_plan_entry_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;
