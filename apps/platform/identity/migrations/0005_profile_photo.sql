-- Account: the person's profile photo. The picture itself is a file in the Platform's own storage folder; this row only holds its file name and type.
-- Additive only.
alter table "accountProfile" add column "photoKey" text, add column "photoType" text, add column "photoUpdatedAt" timestamptz;
