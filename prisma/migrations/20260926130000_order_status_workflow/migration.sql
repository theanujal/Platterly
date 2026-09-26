-- Order status workflow (AJ, 2026-09-26).
--
-- OrderStatus is recreated (not renamed value-by-value) because two old
-- values (CONFIRMED, READY) have to be merged into others and Postgres can't
-- drop an enum value. Existing rows are mapped in the same statement:
--   DRAFT -> PENDING_REVIEW, CONFIRMED -> APPROVED,
--   IN_PREPARATION / READY -> SENT_TO_KITCHEN, COMPLETED / CANCELLED unchanged.
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_REVIEW', 'AWAITING_CUSTOMER_APPROVAL', 'KITCHEN_REVIEW', 'APPROVED', 'SENT_TO_KITCHEN', 'COMPLETED', 'CANCELLED');

ALTER TABLE "order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'DRAFT' THEN 'PENDING_REVIEW'
    WHEN 'CONFIRMED' THEN 'APPROVED'
    WHEN 'IN_PREPARATION' THEN 'SENT_TO_KITCHEN'
    WHEN 'READY' THEN 'SENT_TO_KITCHEN'
    ELSE "status"::text
  END
)::"OrderStatus_new";
ALTER TABLE "order" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

-- Kitchen production status: pure renames, existing rows keep their meaning.
ALTER TYPE "KitchenProductionStatus" RENAME VALUE 'PREPARING' TO 'IN_PREPARATION';
ALTER TYPE "KitchenProductionStatus" RENAME VALUE 'COMPLETED' TO 'DELIVERED';

-- Customer approval links are tied to one MenuVersion.
ALTER TYPE "SecureAccessResourceType" ADD VALUE 'MENU_APPROVAL';

-- Frozen content + send/supersede timestamps on each menu version.
ALTER TABLE "menu_version" ADD COLUMN "snapshot" JSONB,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "supersededAt" TIMESTAMP(3);
