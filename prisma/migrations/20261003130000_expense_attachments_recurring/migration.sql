-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "recurringExpenseId" TEXT;

-- CreateTable
CREATE TABLE "expense_attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "paymentMethod" "PaymentMethod",
    "supplierName" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunThrough" DATE,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_attachment_expenseId_idx" ON "expense_attachment"("expenseId");

-- CreateIndex
CREATE INDEX "recurring_expense_organizationId_idx" ON "recurring_expense"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_recurringExpenseId_spentAt_key" ON "expense"("recurringExpenseId", "spentAt");

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachment" ADD CONSTRAINT "expense_attachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachment" ADD CONSTRAINT "expense_attachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense" ADD CONSTRAINT "recurring_expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
