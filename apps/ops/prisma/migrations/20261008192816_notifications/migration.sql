-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "productKey" TEXT,
    "businessId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_readAt_createdAt_idx" ON "notification"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notification_productKey_createdAt_idx" ON "notification"("productKey", "createdAt");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "product"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing alerts become notifications (the code is the title, the message the body); acknowledged ones are read.
INSERT INTO "notification" ("id", "productKey", "businessId", "kind", "severity", "title", "body", "createdAt", "readAt")
SELECT "id", "productKey", "businessId", "code", "severity", "code", "message", "createdAt", "acknowledgedAt" FROM "alert";
