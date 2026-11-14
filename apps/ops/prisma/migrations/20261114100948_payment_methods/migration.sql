-- CreateTable
CREATE TABLE "razorpay_customer" (
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_customer_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "payment_method" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "razorpayTokenId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_customer_customerId_key" ON "razorpay_customer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_razorpayTokenId_key" ON "payment_method"("razorpayTokenId");

-- CreateIndex
CREATE INDEX "payment_method_businessId_idx" ON "payment_method"("businessId");

-- CreateIndex
CREATE INDEX "payment_method_razorpaySubscriptionId_idx" ON "payment_method"("razorpaySubscriptionId");

-- AddForeignKey
ALTER TABLE "razorpay_customer" ADD CONSTRAINT "razorpay_customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
