-- data-safe-approved: adds one column with a default of 0 to organisations; no existing value is changed, dropped or rewritten.
ALTER TABLE "organisations" ADD COLUMN "name_version" BIGINT NOT NULL DEFAULT 0;
