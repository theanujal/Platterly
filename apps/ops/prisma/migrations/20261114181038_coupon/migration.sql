-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "subscription_payment" ADD COLUMN     "couponDiscount" DECIMAL(10,2),
ADD COLUMN     "couponId" TEXT;

-- CreateTable
CREATE TABLE "coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "productKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_key" ON "coupon"("code");

-- CreateIndex
CREATE INDEX "subscription_payment_couponId_idx" ON "subscription_payment"("couponId");

-- AddForeignKey
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
