create table leave_evidence (
  id           uuid primary key default gen_random_uuid(),
  leave_id     uuid not null references leave_log(id) on delete cascade,
  uploaded_by  text not null,
  file_path    text,
  file_name    text,
  external_url text,
  note         text,
  created_at   timestamptz not null default now()
);
