-- Account deletion requests now go to Ops, where staff approve or decline (decided 2026-11-15). The table keeps the person's request and what Ops decided.
-- Additive: new columns, and the status check is widened (no existing row changes).
alter table "deletionRequest" drop constraint "deletionRequest_status_check";
alter table "deletionRequest" add constraint "deletionRequest_status_check" check ("status" in ('pending', 'approved', 'declined', 'cancelled', 'restored'));
alter table "deletionRequest"
  add column "opsPayload" jsonb,
  add column "opsNotifiedAt" timestamptz,
  add column "withdrawNotifiedAt" timestamptz,
  add column "decidedAt" timestamptz,
  add column "declineReason" text;
