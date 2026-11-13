-- data-safe-approved: the cascade is on a brand-new table (ownership_transfers) that holds only transfer invitations; the central_role check is only widened.
-- Admin transfer by invitation. Additive: one new table, and the central_role check widened by one value ('former_admin': the old Admin who stays on
-- as a read-only member after a transfer). No row is removed or rewritten. The one-active-Admin index and the floor triggers look only at 'admin', so they
-- are unchanged.
ALTER TABLE "organisation_members" DROP CONSTRAINT "organisation_members_central_role_check";
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_central_role_check" CHECK ("central_role" IN ('admin', 'former_admin'));

CREATE TABLE "ownership_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" TEXT NOT NULL,
    "from_member_id" UUID NOT NULL,
    "nominee_email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "accepted_user_id" UUID,

    CONSTRAINT "ownership_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ownership_transfers_status_check" CHECK ("status" IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
    CONSTRAINT "ownership_transfers_resolved_check" CHECK (("status" = 'pending') = ("resolved_at" IS NULL))
);

CREATE UNIQUE INDEX "ownership_transfers_token_hash_key" ON "ownership_transfers"("token_hash");
CREATE INDEX "ownership_transfers_organisation_id_idx" ON "ownership_transfers"("organisation_id");
-- At most one pending transfer per business.
CREATE UNIQUE INDEX "ownership_transfers_one_pending_key" ON "ownership_transfers"("organisation_id") WHERE "status" = 'pending';

ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
