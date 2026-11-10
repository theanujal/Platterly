-- Newsletter delivery log (AJ, 2026-11-10). One row per person per issue, written as the Platform sends, so a repeated or interrupted run never mails anyone twice.
-- "status" is sent or failed (a failed address is not retried for the same issue). Issues themselves live in Ops. Additive: one new table.
create table "newsletterDelivery" (
  "issueId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "status" text not null,
  "at" timestamptz not null default CURRENT_TIMESTAMP,
  primary key ("issueId", "userId")
);
create index "newsletterDelivery_issue" on "newsletterDelivery" ("issueId");
