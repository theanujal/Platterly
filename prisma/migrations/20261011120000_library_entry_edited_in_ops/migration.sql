-- data-safe-approved: only adds a defaulted boolean column to the two library tables; no existing data is removed or rewritten.
-- AlterTable
ALTER TABLE "system_food_item" ADD COLUMN     "editedInOps" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "system_ingredient" ADD COLUMN     "editedInOps" BOOLEAN NOT NULL DEFAULT false;
