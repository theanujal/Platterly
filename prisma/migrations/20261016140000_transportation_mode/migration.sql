-- AlterTable
ALTER TABLE "order" ADD COLUMN     "transportationMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "transportationRate" DECIMAL(7,3) NOT NULL DEFAULT 0;
