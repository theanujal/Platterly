-- AlterTable
ALTER TABLE "product" ADD COLUMN     "cardImage" TEXT,
ADD COLUMN     "tagline" TEXT;

-- CreateTable
CREATE TABLE "upcoming_product" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "cardImage" TEXT,
    "launchAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "upcoming" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "launchNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upcoming_product_pkey" PRIMARY KEY ("key")
);

-- Starting data (AJ, 2026-11-15). Caterly's card gets its line and picture; Rivo is the one upcoming product shown. Opsly, Insights and Supply are kept but hidden
-- (AJ is not sure what they are yet); staff show them on the Products page. No launch date is set: staff add one there. Existing values are never overwritten.
UPDATE "product" SET "tagline" = 'Catering business platform', "cardImage" = 'builtin:cloche' WHERE "key" = 'catering' AND "tagline" IS NULL AND "cardImage" IS NULL;

INSERT INTO "upcoming_product" ("key", "name", "tagline", "cardImage", "sortOrder", "upcoming", "visible", "updatedAt") VALUES
    ('rivo', 'Rivo', 'Business growth platform', 'builtin:growth', 10, true, true, CURRENT_TIMESTAMP),
    ('opsly', 'Opsly', 'Operations and team management', 'builtin:clipboard', 20, true, false, CURRENT_TIMESTAMP),
    ('insights', 'Insights', 'Business analytics and reporting', 'builtin:donut', 30, true, false, CURRENT_TIMESTAMP),
    ('supply', 'Supply', 'Procurement and vendor management', 'builtin:boxes', 40, true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
