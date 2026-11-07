-- The stub product's own scratch database (F6.3.3). It stands in for a real product's database: its own sessions, the memberships it has been told
-- about, and the guards a consumer needs (event sequence per business, logout-token replay). Nothing here is shared with Platform.
create table if not exists stub_session (
  id uuid primary key default gen_random_uuid(),
  sid text not null,          -- the identity provider's session id (for back-channel logout)
  sub text not null,          -- the provider's subject
  email text not null,
  id_token text not null,     -- kept only to be the id_token_hint on sign-out
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists stub_session_sid_idx on stub_session (sid);
create index if not exists stub_session_sub_idx on stub_session (sub);

-- A logout token may be used once: its jti is remembered until the token would have expired anyway.
create table if not exists stub_logout_jti (
  jti text primary key,
  expires_at timestamptz not null
);

-- What Platform has told this product (events). `user_id` is whatever the event's data.userId says; the stub treats it as the provider subject.
create table if not exists stub_membership (
  business_id text not null,
  user_id text not null,
  role text not null,
  status text not null check (status in ('active', 'disabled', 'removed')),
  membership_version integer not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create table if not exists stub_business (
  business_id text primary key,
  status text not null check (status in ('active', 'suspended', 'closed')),
  owner_user_ids text[] not null default '{}',
  billing_contact_email text,
  updated_at timestamptz not null default now()
);

-- Highest event sequence applied per business: an event that is not higher is a duplicate or out of order and changes nothing.
create table if not exists stub_business_sequence (
  business_id text primary key,
  last_sequence integer not null check (last_sequence >= 1)
);
create table if not exists stub_event_log (
  event_id text primary key,
  business_id text not null,
  sequence integer not null,
  type text not null,
  received_at timestamptz not null default now()
);
