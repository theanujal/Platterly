-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "isChefsSpecial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLiveCounter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false;
