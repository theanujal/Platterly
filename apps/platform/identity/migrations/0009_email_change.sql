-- Change of sign-in email. A change is first "pending" (a code was sent to the NEW address), then "completed" (the code was right, the email changed, and a
-- 72-hour window opens in which the old address can cancel it with a link), then possibly "cancelled" (the old address used the link). Only hashes of the
-- code and of the cancel token are kept. While the window is open ("holdUntil" in the future) ownership transfers, claim consumption and billing-contact
-- changes are to be held by the features that own them. At most one pending change per person. Additive only.
create table "emailChange" (
  "id" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "oldEmail" text not null,
  "newEmail" text not null,
  "status" text not null check ("status" in ('pending', 'completed', 'cancelled')),
  "codeHash" text,
  "codeExpiresAt" timestamptz,
  "attempts" integer not null default 0,
  "sentAt" timestamptz,
  "cancelTokenHash" text,
  "holdUntil" timestamptz,
  "completedAt" timestamptz,
  "cancelledAt" timestamptz,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP
);
create unique index "emailChange_one_pending" on "emailChange" ("userId") where "status" = 'pending';
create unique index "emailChange_cancel_token" on "emailChange" ("cancelTokenHash") where "cancelTokenHash" is not null;
