create table if not exists holidays (
  id      uuid primary key default gen_random_uuid(),
  date    date not null,
  name    text not null,
  country text not null
);
create unique index if not exists holidays_date_country on holidays(date, country);
