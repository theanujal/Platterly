-- AlterTable
ALTER TABLE "order" ADD COLUMN     "customCharges" JSONB NOT NULL DEFAULT '[]';
