-- Additive: nullable jsonb on account_deletion_request.
ALTER TABLE "account_deletion_request" ADD COLUMN "eraseLogoUrls" JSONB;
