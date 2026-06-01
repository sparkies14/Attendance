-- Distinguish auto-imported holidays from manually-entered ones.
alter table holidays add column if not exists source text not null default 'manual';
