alter table attendance
  add column if not exists accumulated_hours numeric default 0,
  add column if not exists last_clock_in text default '';
