create table appeals (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id) on delete cascade,
  target_type     text not null check (target_type in ('discipline', 'leave', 'attendance')),
  target_id       text not null,
  reason          text not null,
  status          text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  resolution_note text,
  resolved_by     text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
