-- Milestone B: re-add the credential check that was removed in 002.
--
-- This version is smarter:
--   - Includes last_login_at as a valid credential signal (lets migrated
--     users pass once they've logged in).
--   - Uses NOT VALID, which enforces the check on future INSERT/UPDATE
--     but does not validate existing rows. This is important because the
--     legacy migrated rows currently have all three credential columns
--     null and last_login_at null.

alter table users drop constraint if exists users_active_must_have_credential;

alter table users add constraint users_active_must_have_credential
  check (
    status <> 'Active'
    or password_hash is not null
    or google_sub is not null
    or last_login_at is not null
  ) not valid;
