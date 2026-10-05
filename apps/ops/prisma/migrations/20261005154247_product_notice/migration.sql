-- CreateTable
CREATE TABLE "product_notice" (
    "productKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "message" TEXT,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "product_notice_pkey" PRIMARY KEY ("productKey")
);

-- AddForeignKey
ALTER TABLE "product_notice" ADD CONSTRAINT "product_notice_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE CASCADE ON UPDATE CASCADE;
