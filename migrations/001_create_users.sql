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

alter table users drop constraint if exists users_has_credential;
alter table users add constraint users_has_credential
  check (status <> 'Active' or password_hash is not null or google_sub is not null);
