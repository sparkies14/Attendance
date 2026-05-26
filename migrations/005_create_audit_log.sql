-- Milestone B: audit_log table

create extension if not exists pgcrypto;  -- for gen_random_uuid()

create table if not exists audit_log (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid references users(id),
  actor_email     text,
  actor_role      text,
  action          text not null,
  target_user_id  uuid,
  target_table    text,
  target_id       text,
  details         jsonb,
  ip_address      text,
  user_agent      text
);

create index if not exists audit_log_occurred_at on audit_log(occurred_at desc);
create index if not exists audit_log_actor       on audit_log(actor_user_id);
create index if not exists audit_log_action      on audit_log(action);
