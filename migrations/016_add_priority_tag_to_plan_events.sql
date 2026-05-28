alter table plan_events
  add column if not exists priority text not null default 'p2',
  add column if not exists tag text;

alter table plan_events
  add constraint plan_events_priority_check check (priority in ('p1', 'p2', 'p3'));
