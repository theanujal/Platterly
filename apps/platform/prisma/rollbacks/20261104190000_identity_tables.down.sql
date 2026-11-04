-- Reviewed rollback for 20261104190000_identity_tables. Never run automatically and never by Prisma.
-- For an empty or test database only: after real data exists, correct with a forward-fix migration instead.
-- Children first. No IF EXISTS and no CASCADE, so a missing or dependent table fails loudly.
-- The migration history row is removed by the round-trip runner in the same transaction, not here.
DROP TABLE "legacy_mappings";
DROP TABLE "user_identities";
DROP TABLE "users";
