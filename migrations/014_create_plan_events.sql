create table plan_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  title       text not null,
  start_time  text not null,
  end_time    text not null,
  completed   boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on plan_events (user_id, date);
