-- data-safe-approved: purely additive (one new table). The cascade is on the new child table only, so a business's saved role changes go when the business itself is deleted, like its other tenant data.

-- CreateTable
CREATE TABLE "RolePermissionOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "grants" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "RolePermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermissionOverride_organizationId_role_key" ON "RolePermissionOverride"("organizationId", "role");

-- AddForeignKey
ALTER TABLE "RolePermissionOverride" ADD CONSTRAINT "RolePermissionOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
