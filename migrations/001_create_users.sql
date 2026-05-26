-- Milestone A: unified users table

create extension if not exists pgcrypto;  -- for gen_random_uuid()

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  name            text not null,
  password_hash   text,
  google_sub      text unique,
  role            text not null check (role in ('owner', 'admin', 'member')),
  job_role        text,
  status          text not null check (status in ('Active', 'Inactive', 'Pending')) default 'Pending',
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create unique index if not exists users_one_owner
  on users (role) where role = 'owner';

-- NOTE: an earlier draft of this migration included a users_has_credential
-- check constraint requiring Active rows to have a password_hash or google_sub.
-- It was removed because it blocks the data migration from legacy
-- managers/members tables (those rows have neither field — google_sub is
-- populated on first Google login). See 002_drop_credential_check.sql for the
-- corresponding cleanup if you ran the earlier version.
