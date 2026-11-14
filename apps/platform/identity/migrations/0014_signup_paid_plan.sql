-- Paid-plan sign-up (AJ, 2026-11-14, docs/paid-plan-signup-plan.md). A person who chose a paid plan gets no trial and no Platform business until the payment succeeds, so the
-- sign-up row remembers what they chose and the business id reserved for them. "status" is trial (the existing rows), pending_payment, or completed (paid, business made).
-- "verifiedAt" starts the payment window. Additive: new columns with defaults, nothing rewritten.
alter table "signupProduct"
  add column "planCode" text,
  add column "interval" text,
  add column "reservedBusinessId" text,
  add column "status" text not null default 'trial',
  add column "verifiedAt" timestamptz;
create unique index "signupProduct_reservedBusinessId_key" on "signupProduct" ("reservedBusinessId") where "reservedBusinessId" is not null;
create index "signupProduct_pending" on "signupProduct" ("status") where "status" = 'pending_payment';
