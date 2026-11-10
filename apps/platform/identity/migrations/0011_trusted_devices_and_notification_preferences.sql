-- Trusted devices (AJ, 2026-11-10): a device that passed the two-step code and was ticked "trust this device" stays trusted until the person removes it or
-- changes their password (no day limit). The provider keeps the trust itself in "verification" (identifier "trust-device-...", value = the user id); this table
-- only remembers a plain label (browser and system, never an address) so the person can tell the devices apart. Additive: two new tables.
create table "trustedDeviceLabel" (
  "identifier" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "label" text not null,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP
);
create index "trustedDeviceLabel_user" on "trustedDeviceLabel" ("userId");

-- Account notification choices (AJ, 2026-11-10). One row per person, created when they first change a choice; no row means the defaults. Security, ownership
-- and billing notices are mandatory and are NOT here. Product notices stay with each product. The newsletter choice is not stored here: it is the existing
-- "accountProfile"."notifyProductUpdates" (off unless turned on), so there is one source of truth.
create table "notificationPreference" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "newSignInAlert" boolean not null default true,
  "thirdPartyAlert" boolean not null default true,
  "updatedAt" timestamptz not null default CURRENT_TIMESTAMP
);
