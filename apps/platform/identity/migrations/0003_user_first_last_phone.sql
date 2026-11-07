-- The common details every Platterly product collects at sign-up now live on the person: first name, last name and phone (E.164). "name" stays as the
-- display name (first + last). Existing people are split from their name; the phone saved by the Account profile moves here. Nothing is lost.
alter table "user" add column "firstName" text, add column "lastName" text, add column "phone" text;
update "user" u set "phone" = p."phone" from "accountProfile" p where p."userId" = u."id" and p."phone" is not null;
update "user" set "firstName" = split_part(trim("name"), ' ', 1), "lastName" = nullif(trim(substr(trim("name"), length(split_part(trim("name"), ' ', 1)) + 1)), '') where "firstName" is null;
alter table "accountProfile" drop column "phone";
