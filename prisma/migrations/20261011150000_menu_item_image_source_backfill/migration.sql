-- data-safe-approved: only fills the previously unused "imageSource" column where it is still NULL (no existing value is changed, nothing removed): a picture on a dish that was never copied from the library is the kitchen's own upload, one on a dish copied from the library is the library's.
UPDATE "menu_item" SET "imageSource" = 'upload' WHERE "imageSource" IS NULL AND "image" IS NOT NULL AND "sourceCatalogId" IS NULL;
UPDATE "menu_item" SET "imageSource" = 'library' WHERE "imageSource" IS NULL AND "image" IS NOT NULL AND "sourceCatalogId" IS NOT NULL;
