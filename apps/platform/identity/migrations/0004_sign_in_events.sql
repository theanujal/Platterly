-- Account: each person's own sign-in history (successful sign-ins and refused attempts). Kept 90 days; a person sees only their own. No IP address is stored
-- here: only when, what kind of device (from the browser's user-agent label) and the outcome. Removing the person removes the rows. Additive only.
create table "signInEvent" (
  "id" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "outcome" text not null check ("outcome" in ('signed_in', 'wrong_password')),
  "userAgent" text,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP
);
create index "signInEvent_user_time" on "signInEvent" ("userId", "createdAt" desc);
