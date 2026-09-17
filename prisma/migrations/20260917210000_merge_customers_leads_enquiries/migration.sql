-- Merge Leads/Enquiries into Customer (2026-09-17, AJ) — one record per
-- person instead of two. Order matters below: add the new Customer columns
-- first, fold every Enquiry row into Customer while the "enquiry" table
-- still exists, then drop the old location columns and the Enquiry table.

-- DropForeignKey
ALTER TABLE "enquiry" DROP CONSTRAINT "enquiry_customerId_fkey";

-- DropForeignKey
ALTER TABLE "enquiry" DROP CONSTRAINT "enquiry_eventTypeId_fkey";

-- DropForeignKey
ALTER TABLE "enquiry" DROP CONSTRAINT "enquiry_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "enquiry" DROP CONSTRAINT "enquiry_preferredMenuId_fkey";

-- AlterTable
ALTER TABLE "customer"
  ADD COLUMN "isEnquiry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "leadSource" "EnquiryLeadSource";

-- Data migration: Enquiries already converted to a Customer — carry
-- isEnquiry/leadSource onto that existing Customer row, backfilling notes
-- only when the Customer has none of its own yet (never clobber it).
UPDATE "customer" c
SET "isEnquiry" = true,
    "leadSource" = e."leadSource",
    "notes" = COALESCE(c."notes", e."notes")
FROM "enquiry" e
WHERE e."customerId" = c."id";

-- Data migration: Enquiries never converted — under the merged model they
-- were always a Lead-status Customer (status is derived from Order
-- ownership, so no explicit status column to set), so insert one directly,
-- preserving the row id.
INSERT INTO "customer" ("id", "organizationId", "name", "phone", "notes", "isActive", "isEnquiry", "leadSource", "createdAt", "updatedAt")
SELECT e."id", e."organizationId", e."name", e."phone", e."notes", true, true, e."leadSource", e."createdAt", e."updatedAt"
FROM "enquiry" e
WHERE e."customerId" IS NULL;

-- AlterTable
ALTER TABLE "customer" DROP COLUMN "addressLine1",
DROP COLUMN "city",
DROP COLUMN "state";

-- DropTable
DROP TABLE "enquiry";

-- DropEnum
DROP TYPE "EnquiryStatus";
