-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FOOD', 'LABOUR', 'TRANSPORT', 'EQUIPMENT', 'VENUE', 'MISC');

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "spentAt" DATE NOT NULL,
    "paymentMethod" "PaymentMethod",
    "supplierName" TEXT,
    "notes" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_organizationId_orderId_idx" ON "expense"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "expense_organizationId_spentAt_idx" ON "expense"("organizationId", "spentAt");

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
