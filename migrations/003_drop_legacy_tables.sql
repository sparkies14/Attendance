-- Milestone B: drop legacy managers/members tables.
--
-- Prerequisites:
--   1. migrations/001_create_users.sql has been applied.
--   2. scripts/migrate-users-data.js has been run (data migrated to users table).
--   3. The new auth flow is verified working (sign in, admin panel, etc.).
--
-- Run this ONLY after you've confirmed the new system is fully working --
-- there is no rollback once these tables are dropped.

drop table if exists managers;
drop table if exists members;
