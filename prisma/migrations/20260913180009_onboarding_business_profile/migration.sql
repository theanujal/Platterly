-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "businessDescription" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "gstShowOnInvoices" BOOLEAN DEFAULT false,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT;
