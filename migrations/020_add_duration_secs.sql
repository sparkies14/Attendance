-- Second-level precision for break/lunch durations.
alter table break_log add column if not exists duration_secs integer not null default 0;
alter table lunch_log add column if not exists duration_secs integer not null default 0;
