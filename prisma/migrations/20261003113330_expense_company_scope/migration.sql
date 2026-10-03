-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseCategory" ADD VALUE 'RENT';
ALTER TYPE "ExpenseCategory" ADD VALUE 'SALARIES';
ALTER TYPE "ExpenseCategory" ADD VALUE 'UTILITIES';
ALTER TYPE "ExpenseCategory" ADD VALUE 'MARKETING';
ALTER TYPE "ExpenseCategory" ADD VALUE 'MAINTENANCE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'LICENCES_FEES';

-- AlterTable
ALTER TABLE "expense" ALTER COLUMN "orderId" DROP NOT NULL;
