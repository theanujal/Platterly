-- AlterTable: add the new columns first (nullable), backfill from the old
-- single-string columns, then drop `ownerName` — hand-edited from Prisma's
-- generated skeleton so the backfill runs before data is lost.

ALTER TABLE "organization" ADD COLUMN "ownerFirstName" TEXT,
ADD COLUMN "ownerLastName" TEXT;

ALTER TABLE "user" ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

-- Backfill: split on the first space, same rule the pre-existing lossy
-- user-profile UI split already used. A name with no space (e.g. "Priya")
-- gets firstName="Priya", lastName=NULL — guarded explicitly since
-- position()=0 would otherwise make substring() return the whole string
-- again, duplicating it into lastName.
UPDATE "user"
SET "firstName" = split_part("name", ' ', 1),
    "lastName" = CASE
      WHEN position(' ' in "name") > 0
        THEN NULLIF(trim(substring("name" from position(' ' in "name") + 1)), '')
      ELSE NULL
    END
WHERE "name" IS NOT NULL AND "name" != '';

UPDATE "organization"
SET "ownerFirstName" = split_part("ownerName", ' ', 1),
    "ownerLastName" = CASE
      WHEN position(' ' in "ownerName") > 0
        THEN NULLIF(trim(substring("ownerName" from position(' ' in "ownerName") + 1)), '')
      ELSE NULL
    END
WHERE "ownerName" IS NOT NULL AND "ownerName" != '';

ALTER TABLE "organization" DROP COLUMN "ownerName";
