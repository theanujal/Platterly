-- data-safe-approved: a new table; the cascade only removes this read copy when its own organisation is deleted, and Ops holds the original
-- CreateTable
CREATE TABLE "organization_billing_profile" (
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profile" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_billing_profile_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "organization_billing_profile" ADD CONSTRAINT "organization_billing_profile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
