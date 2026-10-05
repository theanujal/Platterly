-- CreateTable
CREATE TABLE "ops_notice" (
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "message" TEXT,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_notice_pkey" PRIMARY KEY ("businessId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ops_notice_organizationId_key" ON "ops_notice"("organizationId");
