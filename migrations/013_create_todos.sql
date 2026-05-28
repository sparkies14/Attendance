create table todos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  text        text not null,
  completed   boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on todos (user_id, date);
