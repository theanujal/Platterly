-- CreateTable
CREATE TABLE "platform_pending_member" (
    "subject" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_pending_member_pkey" PRIMARY KEY ("subject")
);

-- CreateIndex
CREATE INDEX "platform_pending_member_businessId_idx" ON "platform_pending_member"("businessId");
