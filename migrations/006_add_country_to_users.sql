-- Add country column to users (ISO 3166-1 alpha-2 code, e.g. 'PH', 'VN', 'JP')
alter table users add column if not exists country text default 'PH';
