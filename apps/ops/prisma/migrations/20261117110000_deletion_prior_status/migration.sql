-- Additive: the business status before an approve, so an undo only restores what the request suspended.
ALTER TABLE "account_deletion_request" ADD COLUMN "priorBusinessStatus" TEXT;
