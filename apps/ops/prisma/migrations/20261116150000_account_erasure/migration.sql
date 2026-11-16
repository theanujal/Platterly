-- Additive: two nullable timestamps on account_deletion_request for the staff "Erase now" step.
ALTER TABLE "account_deletion_request" ADD COLUMN "eraseRequestedAt" TIMESTAMP(3),
ADD COLUMN "erasedAt" TIMESTAMP(3);
