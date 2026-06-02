-- Emergency exit flag + reason on the attendance record.
alter table attendance add column if not exists emergency boolean not null default false;
alter table attendance add column if not exists emergency_reason text;
