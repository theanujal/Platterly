-- CreateEnum
CREATE TYPE "MenuApprovalNoteAuthor" AS ENUM ('CUSTOMER', 'KITCHEN', 'TEAM');

-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quotation_item" ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "menu_approval_note" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "menuSelectionId" TEXT NOT NULL,
    "versionNumber" INTEGER,
    "authorType" "MenuApprovalNoteAuthor" NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_approval_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_approval_note_menuSelectionId_idx" ON "menu_approval_note"("menuSelectionId");

-- CreateIndex
CREATE INDEX "menu_approval_note_organizationId_idx" ON "menu_approval_note"("organizationId");

-- AddForeignKey
ALTER TABLE "menu_approval_note" ADD CONSTRAINT "menu_approval_note_menuSelectionId_fkey" FOREIGN KEY ("menuSelectionId") REFERENCES "menu_selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a per-guest dish on a meal was an Extra (drawer saved it with a guest-count quantity).
UPDATE "order_item" SET "isExtra" = true WHERE "itemType" = 'MENU_ITEM' AND "mealPlanEntryId" IS NOT NULL AND "quantity" > 1;
UPDATE "quotation_item" SET "isExtra" = true WHERE "itemType" = 'MENU_ITEM' AND "mealPlanEntryId" IS NOT NULL AND "quantity" > 1;

-- Backfill: keep the single request notes that already exist as the first entries of the note history.
INSERT INTO "menu_approval_note" ("id", "organizationId", "menuSelectionId", "versionNumber", "authorType", "body", "createdAt")
SELECT gen_random_uuid()::text, "organizationId", "id", "currentVersion", 'CUSTOMER', "customerRequestNote", "updatedAt"
FROM "menu_selection" WHERE "customerRequestNote" IS NOT NULL;

INSERT INTO "menu_approval_note" ("id", "organizationId", "menuSelectionId", "versionNumber", "authorType", "body", "createdAt")
SELECT gen_random_uuid()::text, "organizationId", "id", "currentVersion", 'KITCHEN', "kitchenRequestNote", "updatedAt"
FROM "menu_selection" WHERE "kitchenRequestNote" IS NOT NULL;
