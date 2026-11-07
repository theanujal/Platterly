-- Account: the person's own profile details that Better Auth's "user" table has no column for. The name stays in "user"."name".
-- One row per person, created on first save. Removing the person removes the row. Additive only.
create table "accountProfile" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "phone" text,
  "timeZone" text,
  "notifyProductUpdates" boolean not null default false,
  "updatedAt" timestamptz not null default CURRENT_TIMESTAMP
);
