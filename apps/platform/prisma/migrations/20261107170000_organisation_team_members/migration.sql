-- data-safe-approved: new table only, nothing existing is dropped, altered or rewritten; the cascading delete applies only to this table's own rows when a staff member deletes an organisation, and the same people remain in Caterly.
-- Read-only team list shown on the Account Business page (AJ, 2026-11-07): the non-owner members of a business imported from Caterly.
-- These people are NOT Platform members: no sign-in, no permission, no product slot. One new table, nothing existing is changed.
CREATE TABLE "organisation_team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" TEXT NOT NULL,
    "legacy_member_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organisation_team_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organisation_team_members_role_check" CHECK (length(role) > 0),
    CONSTRAINT "organisation_team_members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "organisation_team_members_organisation_id_legacy_member_id_key" ON "organisation_team_members"("organisation_id", "legacy_member_id");
