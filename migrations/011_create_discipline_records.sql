create table discipline_records (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id) on delete cascade,
  reason          text not null,
  issued_by       text not null,
  issued_at       timestamptz not null default now(),
  voided          boolean not null default false,
  void_reason     text,
  voided_by       text,
  voided_at       timestamptz,
  acknowledged    boolean not null default false,
  acknowledged_at timestamptz
);
