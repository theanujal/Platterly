-- Simpler status workflow (AJ, 2026-09-30).
--
-- The kitchen-review steps go: after the customer approves, the office team locks the menu and it goes to the
-- kitchen. Both enums are recreated because Postgres can't drop enum values; existing rows map in the same statement:
--   MenuSelectionStatus: KITCHEN_REVIEWING -> CUSTOMER_APPROVED, KITCHEN_APPROVED -> FINAL_LOCKED,
--                        KITCHEN_CHANGES_REQUESTED -> CHANGES_REQUESTED
--   OrderStatus:         KITCHEN_REVIEW -> APPROVED
CREATE TYPE "MenuSelectionStatus_new" AS ENUM ('DRAFT', 'SENT_TO_CUSTOMER', 'CUSTOMER_REVIEWING', 'CHANGES_REQUESTED', 'CUSTOMER_APPROVED', 'FINAL_LOCKED');

ALTER TABLE "menu_selection" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "menu_selection" ALTER COLUMN "status" TYPE "MenuSelectionStatus_new" USING (
  CASE "status"::text
    WHEN 'KITCHEN_REVIEWING' THEN 'CUSTOMER_APPROVED'
    WHEN 'KITCHEN_APPROVED' THEN 'FINAL_LOCKED'
    WHEN 'KITCHEN_CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
    ELSE "status"::text
  END
)::"MenuSelectionStatus_new";
ALTER TABLE "menu_selection" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "menu_version" ALTER COLUMN "status" TYPE "MenuSelectionStatus_new" USING (
  CASE "status"::text
    WHEN 'KITCHEN_REVIEWING' THEN 'CUSTOMER_APPROVED'
    WHEN 'KITCHEN_APPROVED' THEN 'FINAL_LOCKED'
    WHEN 'KITCHEN_CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
    ELSE "status"::text
  END
)::"MenuSelectionStatus_new";

DROP TYPE "MenuSelectionStatus";
ALTER TYPE "MenuSelectionStatus_new" RENAME TO "MenuSelectionStatus";

CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_REVIEW', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVED', 'SENT_TO_KITCHEN', 'COMPLETED', 'CANCELLED');

ALTER TABLE "order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'KITCHEN_REVIEW' THEN 'APPROVED'
    ELSE "status"::text
  END
)::"OrderStatus_new";
ALTER TABLE "order" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

-- Status history: every automatic and manual status change, with the reason for a manual one.
CREATE TYPE "StatusChangeSubject" AS ENUM ('ORDER', 'MENU_APPROVAL');
CREATE TYPE "StatusChangeSource" AS ENUM ('AUTOMATIC', 'MANUAL');

CREATE TABLE "status_change" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuSelectionId" TEXT,
    "subject" "StatusChangeSubject" NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "source" "StatusChangeSource" NOT NULL,
    "trigger" TEXT,
    "reason" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_change_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "status_change_orderId_createdAt_idx" ON "status_change"("orderId", "createdAt");
CREATE INDEX "status_change_organizationId_idx" ON "status_change"("organizationId");

ALTER TABLE "status_change" ADD CONSTRAINT "status_change_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
