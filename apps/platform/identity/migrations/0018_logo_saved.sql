-- When an uploaded business logo was saved to a billing profile. A logo with no savedAt after a week was uploaded and never used, and the scheduled pass deletes it.
-- Additive: one nullable column. Logos uploaded before this migration are marked saved now, so the sweep never touches a file whose use is unknown.
alter table "accountLogoUpload" add column "savedAt" timestamptz;
update "accountLogoUpload" set "savedAt" = now() where "savedAt" is null;
create index "accountLogoUpload_unsaved_idx" on "accountLogoUpload" ("createdAt") where "savedAt" is null;
