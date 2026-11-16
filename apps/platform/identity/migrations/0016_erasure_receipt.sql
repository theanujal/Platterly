-- Permanent erasure (decided 2026-11-16): when staff press "Erase now" in Ops, the Platform removes the person and the business's central records. The person's rows
-- (including their deletionRequest) are gone afterwards, so this keeps one row per erased request, with no personal details, until Ops has been told it is done.
-- Additive: a new table.
create table "erasureReceipt" (
  "requestId" text primary key,
  "erasedAt" timestamptz not null default now(),
  "reportedAt" timestamptz
);
