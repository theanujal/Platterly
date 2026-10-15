-- Additive only: a new enum and three new columns on recipe. Every existing recipe becomes DRAFT (the column default): none is activated
-- silently, so each one needs an explicit approval before it is used for production again. Ingredients, quantities, stock, batches, costs and the ledger are untouched.

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- AlterTable
ALTER TABLE "recipe" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activatedByUserId" TEXT,
ADD COLUMN     "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT';
