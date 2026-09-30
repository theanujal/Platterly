-- AlterTable
ALTER TABLE "menu" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Keep today's order: menus were listed newest first, so number each tenant's menus in that order.
UPDATE "menu"
SET "sortOrder" = ranked.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt" DESC) - 1 AS position
  FROM "menu"
) AS ranked
WHERE "menu".id = ranked.id;
