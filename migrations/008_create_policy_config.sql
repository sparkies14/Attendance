create table if not exists policy_config (
  key   text primary key,
  value text not null
);

insert into policy_config (key, value) values
  ('threshold_minor_tardy', '3'),
  ('threshold_major_tardy', '2'),
  ('threshold_awol_half',   '1'),
  ('threshold_awol_full',   '1')
on conflict (key) do nothing;
