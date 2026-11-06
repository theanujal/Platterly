-- Reviewed rollback for 20261106150000_organisation_schema. Never run automatically and never by Prisma.
-- For an empty or test database only: after real data exists, correct with a forward-fix migration instead.
-- It removes only the eight tables and the functions that this migration created (triggers and indexes go with their tables).
-- Children first. No IF EXISTS and no CASCADE, so a missing or dependent object fails loudly. Nothing from the identity migration is touched.
-- The migration history row is removed by the round-trip runner in the same transaction, not here.
DROP TABLE "membership_product_slots";
DROP TABLE "organisation_creation_requests";
DROP TABLE "organisation_product_unlinks";
DROP TABLE "organisation_members";
DROP TABLE "organisation_products";
DROP TABLE "audit_logs";
DROP TABLE "outbox_events";
DROP TABLE "organisations";
DROP FUNCTION "organisations_before_insert"();
DROP FUNCTION "organisations_before_update"();
DROP FUNCTION "organisation_members_floor_trigger"();
DROP FUNCTION "organisations_floor_trigger"();
DROP FUNCTION "organisation_admin_floor_check"(TEXT);
DROP FUNCTION "organisation_members_establish"();
DROP FUNCTION "organisation_members_before_update"();
DROP FUNCTION "organisation_members_before_delete"();
DROP FUNCTION "organisation_products_established"();
DROP FUNCTION "organisation_products_last_link"();
DROP FUNCTION "membership_product_slots_immutable"();
DROP FUNCTION "membership_product_slots_event_required"();
DROP FUNCTION "audit_logs_append_only"();
