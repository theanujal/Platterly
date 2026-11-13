-- Rolls back 20261113120000_ownership_transfer. Fails on purpose (the check cannot be restored) while any 'former_admin' row exists: decide what becomes of those people first.
DROP TABLE "ownership_transfers";
ALTER TABLE "organisation_members" DROP CONSTRAINT "organisation_members_central_role_check";
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_central_role_check" CHECK ("central_role" IN ('admin'));
