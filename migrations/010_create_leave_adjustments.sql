create table leave_adjustments (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  amount      integer not null,
  note        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
