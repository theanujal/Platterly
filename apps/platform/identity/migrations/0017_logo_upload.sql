-- Who uploaded which business logo file (the file name is random and carries no person). Lets the permanent erase delete logos that were uploaded but never saved
-- to a profile. Additive: a new table; rows go with the person.
create table "accountLogoUpload" (
  "key" text primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "createdAt" timestamptz not null default now()
);
create index "accountLogoUpload_userId_idx" on "accountLogoUpload" ("userId");
