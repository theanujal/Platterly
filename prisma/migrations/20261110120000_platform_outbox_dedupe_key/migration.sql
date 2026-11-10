-- data-safe-approved: adds one nullable column and fills it from each row's own type and business id; no row is removed and no value is lost. The old one-per-(type, business) rule becomes the same rule on the new column, so renames (which leave it empty) can queue many.
ALTER TABLE "platform_outbox" ADD COLUMN "dedupeKey" TEXT;
UPDATE "platform_outbox" SET "dedupeKey" = "type" || ':' || "businessId";
DROP INDEX "platform_outbox_type_businessId_key";
CREATE UNIQUE INDEX "platform_outbox_dedupeKey_key" ON "platform_outbox"("dedupeKey");
