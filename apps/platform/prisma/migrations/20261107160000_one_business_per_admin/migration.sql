-- One person is the active Admin of at most one business (AJ, 2026-11-07). Additive: one partial unique index, no data is removed or rewritten.
-- A second business needs a different sign-in (a different email). The database enforces it whatever route writes the row.
CREATE UNIQUE INDEX "organisation_members_one_admin_per_person_key" ON "organisation_members"("user_id") WHERE "central_role" = 'admin' AND "status" = 'active';
