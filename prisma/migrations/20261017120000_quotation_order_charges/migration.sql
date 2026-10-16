-- AlterTable
ALTER TABLE "quotation" ADD COLUMN     "customCharges" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "discountMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "discountRate" DECIMAL(7,3) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherChargesMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "otherChargesRate" DECIMAL(7,3) NOT NULL DEFAULT 0,
ADD COLUMN     "transportationCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transportationMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "transportationRate" DECIMAL(7,3) NOT NULL DEFAULT 0;

-- data-safe-approved: only fills the new columns from the old ones (delivery -> transportation cost, taxes + additional -> extra / service cost) so every quotation keeps its total; the old columns are left untouched.
UPDATE "quotation"
SET "transportationCost" = "deliveryCharges",
    "otherCharges" = "taxes" + "additionalCharges"
WHERE "deliveryCharges" <> 0 OR "taxes" <> 0 OR "additionalCharges" <> 0;
