-- CreateEnum
CREATE TYPE "KitchenProductionStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED');

-- AlterTable
ALTER TABLE "menu_selection" ADD COLUMN     "kitchenProductionStatus" "KitchenProductionStatus" NOT NULL DEFAULT 'PENDING';
