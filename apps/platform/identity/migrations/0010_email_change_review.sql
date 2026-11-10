-- Email change, second round (AJ, 2026-11-10). The window in which the old address can cancel is now 24 hours (the column "holdUntil" keeps its name and now
-- means "cancel until"). When the old address cancels it must say why, and the account is put on hold until Ops verifies the person ("accountHold"). When the
-- code is never entered, the old address is told once ("noticeSentAt"). Additive only: three nullable columns and one new table.
alter table "emailChange" add column "cancelReason" text;
alter table "emailChange" add column "cancelNote" text;
alter table "emailChange" add column "noticeSentAt" timestamptz;

-- One row per held person while a hold is open or after it was lifted. "reviewId" is the email change that caused it; Ops is told about it ("opsNotifiedAt")
-- and is asked at sign-in time whether staff have verified the person.
create table "accountHold" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "reviewId" text not null,
  "reason" text not null,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP,
  "opsNotifiedAt" timestamptz,
  "liftedAt" timestamptz
);
create index "accountHold_open" on "accountHold" ("userId") where "liftedAt" is null;
