-- Drop users_has_credential check constraint.
--
-- Original intent: prevent Active accounts with no way to log in (no password
-- and no Google link). In practice this blocks the data migration from the
-- legacy managers/members tables, because those rows are Active but have
-- neither field set — their google_sub will be populated on first login.
--
-- A smarter version of this check will be re-added in Milestone B once every
-- user has either set a password or logged in via Google at least once.

alter table users drop constraint if exists users_has_credential;
