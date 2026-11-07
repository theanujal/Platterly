-- Two-step verification (authenticator app and backup codes), the tables Better Auth's two-factor plugin uses. The secret and the backup codes are stored
-- encrypted by the plugin, never in clear. Additive only: nobody has two-step verification until they turn it on.
alter table "user" add column "twoFactorEnabled" boolean default false;
create table "twoFactor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "verified" boolean default true,
  "failedVerificationCount" integer default 0,
  "lockedUntil" timestamptz
);
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");
