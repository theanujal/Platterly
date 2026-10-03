-- CreateTable
CREATE TABLE "customer_note" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_note_organizationId_customerId_idx" ON "customer_note"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each customer's existing single notes text becomes its first dated note (nothing is dropped: customer.notes stays).
INSERT INTO "customer_note" ("id", "organizationId", "customerId", "body", "authorName", "createdAt", "updatedAt")
SELECT 'cn_' || "id", "organizationId", "id", btrim("notes"), 'Team', "updatedAt", "updatedAt"
FROM "customer"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';
