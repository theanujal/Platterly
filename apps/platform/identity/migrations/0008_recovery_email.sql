-- Recovery email: a second address, verified by a code, to which a password-reset code can be sent when the person cannot reach their main email. One row per
-- person. "email" is the verified address in use; the "pending*" columns hold a change that is waiting for its code (only a hash of the code is kept).
-- Additive only.
create table "recoveryEmail" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "email" text,
  "verifiedAt" timestamptz,
  "pendingEmail" text,
  "pendingCodeHash" text,
  "pendingExpiresAt" timestamptz,
  "pendingAttempts" integer not null default 0,
  "pendingSentAt" timestamptz,
  "updatedAt" timestamptz not null default CURRENT_TIMESTAMP
);
