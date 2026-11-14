-- Which registered product a person signed up from (AJ, 2026-11-14, single sign-up). Written at sign-up, read when the email is verified so the Account can create the
-- business and attach that product. One row per person. Additive: one new table.
create table "signupProduct" (
  "userId" text primary key references "user" ("id") on delete cascade,
  "clientId" text not null,
  "at" timestamptz not null default CURRENT_TIMESTAMP
);
