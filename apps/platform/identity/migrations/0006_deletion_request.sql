-- Account: a person's request to have their Platterly account deleted. Staff review it and delete by hand (decided: manual delete only), so this table only
-- records the request. At most one pending request per person. Additive only.
create table "deletionRequest" (
  "id" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "status" text not null check ("status" in ('pending', 'cancelled')),
  "reason" text,
  "requestedAt" timestamptz not null default CURRENT_TIMESTAMP,
  "cancelledAt" timestamptz
);
create unique index "deletionRequest_one_pending" on "deletionRequest" ("userId") where "status" = 'pending';
