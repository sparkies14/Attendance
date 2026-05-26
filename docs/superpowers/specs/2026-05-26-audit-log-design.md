# Milestone B — Audit Log (+ Legacy Cleanup)

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Add an immutable audit trail for security-relevant actions (logins, role changes, approvals). Provide an admin UI to view, export, and (owner-only) purge old records. Close out the legacy promises left over from Milestone A: drop the old `managers`/`members` tables, remove `/webhook/check-role`, and re-add a smarter credential check.

---

## 1. Overview

Milestone A introduced a unified `users` table and role hierarchy, but every action against that data is invisible after the fact. There is no way to answer "who promoted Marco to admin?", "how many failed logins for X@Y.com last week?", or "which admin approved entry #123?". Milestone B fixes that with one new table (`audit_log`), one helper module (`lib/audit.js`), one admin UI tab, and a few hook points inside the existing auth/users/approve routes.

Audit-log writes are **fire-and-forget**: a failure to write the log never fails the action it was logging, but it does get console-logged so the issue is visible to the operator. The system favours availability over completeness here — losing one audit row is better than blocking a clock-in.

Cleanup of old audit rows is restricted to the owner and gated behind a "you must export first" UX so accidental data loss is hard to trigger.

---

## 2. Data Model

### 2.1 New table — `audit_log`

```sql
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid references users(id),
  actor_email     text,
  actor_role      text,
  action          text not null,
  target_user_id  uuid,
  target_table    text,
  target_id       text,
  details         jsonb,
  ip_address      text,
  user_agent      text
);

create index audit_log_occurred_at on audit_log(occurred_at desc);
create index audit_log_actor       on audit_log(actor_user_id);
create index audit_log_action      on audit_log(action);
```

Design notes:
- `actor_*` is denormalized so the audit row remains readable even if the user is later deleted or renamed. We trade a few bytes of storage for a stable history.
- `actor_user_id` is nullable — failed logins have no logged-in user.
- `target_*` columns are loose pointers because targets vary in table and id type (uuid for users, integer for attendance/leave). Using `text` for `target_id` avoids polymorphism gymnastics.
- `details` is JSONB so we can attach action-specific extras (reason, previous role, attempted email) without schema churn.
- No FK from `target_user_id` to `users` — deleting a user should not cascade-delete their audit history. The reference is informational only.
- No retention policy by default. Cleanup is explicit and owner-driven (see §6).

### 2.2 Legacy cleanup

Three things from Milestone A's deferred list become done here:

1. **Drop legacy tables** — `migrations/003_drop_legacy_tables.sql` drops `managers` and `members`. The operator runs it manually in Supabase SQL Editor after they confirm the new flow works.
2. **Remove `/webhook/check-role`** — the route still exists from Milestone A as a legacy shim. The new `index.html` no longer calls it. Removing the route + the routes/checkRole.js file.
3. **Re-add credential check (smarter, NOT VALID)** — `migrations/004_readd_credential_check.sql` adds:
   ```sql
   alter table users add constraint users_active_must_have_credential
   check (
     status <> 'Active'
     or password_hash is not null
     or google_sub is not null
     or last_login_at is not null
   ) not valid;
   ```
   The third predicate (`last_login_at is not null`) lets migrated users — who currently have no `password_hash` or `google_sub` — pass once they've logged in (Google sets `last_login_at` and `google_sub` together). The `NOT VALID` flag is critical: it tells PostgreSQL to enforce the check on **future** `INSERT`s and `UPDATE`s but to skip validating already-existing rows. Without it, the migration would fail because the migrated users currently have all three credential-shaped columns null. We knowingly accept those legacy rows as grandfathered; the next time any of them get touched, they'll be forced into compliance (or the touch will fail, which surfaces the issue at edit time rather than at constraint-add time).

---

## 3. Audit Logger

### 3.1 Module — `lib/audit.js`

Single function:

```js
async function log(req, action, opts = {}) {
  // opts = { target_user_id, target_table, target_id, details }
  // never throws. logs failures to console.error and swallows.
}
```

Behaviour:
- Extracts `actor` info from `req.user` (set by the existing `requireAuth` middleware). For unauthenticated endpoints like `/auth/login` and `/auth/register`, the caller passes the relevant actor info via `opts.actor` explicitly (see §4 wiring table).
- Extracts `ip_address` from `req.headers['x-forwarded-for']` first (split on comma, take the first), falling back to `req.socket?.remoteAddress`. We do not configure Express `trust proxy` in this milestone; that's a deferred infra concern. Records what we see.
- Extracts `user_agent` from `req.headers['user-agent']`.
- Performs a single Supabase insert. On error: `console.error('Audit log failed:', err.message)` and returns.

The helper is exported as `{ log }` and the `action` strings are also exported as a constants object `ACTIONS` to avoid typo bugs at call sites.

### 3.2 Action vocabulary

| Constant | String | Where it fires |
|---|---|---|
| `ACTIONS.LOGIN` | `login` | `POST /auth/login` (success) |
| `ACTIONS.LOGIN_FAILED` | `login_failed` | `POST /auth/login` (any failure path) |
| `ACTIONS.LOGIN_GOOGLE` | `login_google` | `POST /auth/google` (success) |
| `ACTIONS.LOGIN_GOOGLE_FAILED` | `login_google_failed` | `POST /auth/google` (failure) |
| `ACTIONS.REGISTER` | `register` | `POST /auth/register` (both fresh and invite-claim paths) |
| `ACTIONS.PASSWORD_CHANGED` | `password_changed` | `POST /auth/change-password` |
| `ACTIONS.GOOGLE_LINKED` | `google_linked` | `POST /auth/link-google` |
| `ACTIONS.USER_INVITED` | `user_invited` | `POST /users/invite` |
| `ACTIONS.USER_PROMOTED` | `user_promoted` | `POST /users/:id/promote` |
| `ACTIONS.USER_DEMOTED` | `user_demoted` | `POST /users/:id/demote` |
| `ACTIONS.USER_ACTIVATED` | `user_activated` | `POST /users/:id/activate` |
| `ACTIONS.USER_DEACTIVATED` | `user_deactivated` | `POST /users/:id/deactivate` |
| `ACTIONS.ATTENDANCE_APPROVED` | `attendance_approved` | `GET /webhook/approve` (type≠leave, action=approve) |
| `ACTIONS.ATTENDANCE_REJECTED` | `attendance_rejected` | `GET /webhook/approve` (type≠leave, action=reject) |
| `ACTIONS.LEAVE_APPROVED` | `leave_approved` | `GET /webhook/approve` (type=leave, action=approve) |
| `ACTIONS.LEAVE_REJECTED` | `leave_rejected` | `GET /webhook/approve` (type=leave, action=reject) |
| `ACTIONS.AUDIT_CLEANUP` | `audit_cleanup` | `DELETE /audit?before=…` (owner only) |

**Not logged in this milestone** (intentional): clock-in/out, lunch-in/out, break-in/out, leave-request submissions, audit read access. Those either already have a primary record in the domain tables or are too noisy to be useful for security review.

---

## 4. Route Changes

Each modified route gets one new line — the `audit.log(...)` call — immediately after the action's database write succeeds. The intent is to keep the existing logic legible.

| Route | Audit call placement | Notes |
|---|---|---|
| `POST /auth/login` (success) | after `update last_login_at`, before response | `actor` passed explicitly since `req.user` is not yet set |
| `POST /auth/login` (each failure path) | before the error response | actor_user_id null; `details: { email_attempted, reason }` |
| `POST /auth/google` | after profile lookup succeeds | similar to login |
| `POST /auth/register` | after insert/update | actor_user_id is the new/claimed user's id |
| `POST /auth/change-password` | after update | uses `req.user` |
| `POST /auth/link-google` | after update | |
| `POST /users/invite` | after insert | target = new user id |
| `POST /users/:id/{promote\|demote\|activate\|deactivate}` | after update | `details: { previous_role/status, new_role/status }` |
| `GET /webhook/approve` | after update | action picks `attendance_*` or `leave_*` based on `type`; target = the entry id |

All `audit.log(...)` calls are `await`ed but they cannot throw — they just return on failure. No try/catch needed at the call site.

### 4.1 New route — `GET /audit`

Owner + admin. Query params:
- `page` (default 1, max 1000)
- `page_size` (default 50, hard max 200)
- `actor` — exact match on `actor_email`, optional
- `action` — exact match on `action` column, optional
- `from`, `to` — ISO date or timestamp; bounds on `occurred_at`, optional

Returns:
```json
{
  "page": 1,
  "page_size": 50,
  "total": 1234,
  "items": [ { /* audit_log row */ } ]
}
```

Implementation reads `audit_log` ordered by `occurred_at desc`. Pagination is offset-based (simple; performance is fine at expected volumes — a few hundred rows/day).

### 4.2 New route — `DELETE /audit?before=YYYY-MM-DD`

**Owner only.** Deletes rows where `occurred_at < before`. Validates that `before` parses cleanly and is at least 24 hours in the past (refuses to purge anything fresher than yesterday — a guardrail against fat-fingered ranges).

After deleting, writes one final `audit_cleanup` row with `details: { before_date, rows_deleted }`. That row is preserved across future cleanups by design (`before` cannot include itself; the new row's `occurred_at` is `now()`).

### 4.3 Removed — `POST /webhook/check-role`

Route file `routes/checkRole.js` is deleted. The `app.use('/webhook/check-role', …)` mount is removed from `server.js`. Index.html no longer references it (verified — only `/auth/*` calls remain).

---

## 5. Audit UI

### 5.1 New tab in `admin.html`

`admin.html` already has a single page (user table). It grows a tab strip at the top:

```
[ Users ]  [ Audit Log ]
```

Clicking switches the body. State is local to the page (no URL routing — keep it simple).

### 5.2 Audit Log tab layout

```
Audit Log
─────────────────────────────────────────
[ Date range: from ─ to ]  [ Actor ▾ ]  [ Action ▾ ]  [ Apply ]   [ Reset filters ]

[ ⬇ Export CSV ]   [ 🧹 Clean up old records ]  (greyed until export)
                                                 (I already have a backup, skip)

When                Actor          Action            Target          Details
─────────────────────────────────────────────────────────────────────────────────
2 min ago           erwin@…        user_promoted     marco@…         { from: member, to: admin }
5 min ago           erwin@…        login             —               —
1 h ago             (anon)         login_failed      —               { email_attempted: x@y, reason: bad_password }
…
                              ← Prev   Page 1 / 25   Next →
```

Visual details:
- "When" shows relative time, with tooltip showing the absolute ISO timestamp.
- "Actor" shows email (links open the user row in the Users tab).
- "Action" is a badge using the same colour palette as the user-role badges, with one colour per category (auth, user mgmt, approval, cleanup).
- "Details" is JSON truncated to 80 chars with click-to-expand into a small modal.
- Failure rows (`login_failed`, `*_failed`) have a subtle red left border.

### 5.3 Export CSV

Button calls `GET /audit?…&page_size=200&page=…` repeatedly, accumulates rows in memory, builds a CSV blob, triggers a download. After the download succeeds:
- `sessionStorage.setItem('anosupo_audit_exported_at', new Date().toISOString())`
- The Clean button transitions from disabled to enabled.

A note next to the Clean button: "Last export: 12 minutes ago" or "No export this session — please export first."

### 5.4 Clean up button

Disabled by default. Two paths to enable:
1. **Export first** (preferred). The button enables once `sessionStorage.anosupo_audit_exported_at` is set.
2. **"I already have a backup, skip"** — small link below the button. Clicking opens a confirm dialog: "I confirm I have a recent backup of the audit log outside this system." Yes enables Clean for the rest of the session.

Clicking Clean opens a modal:
- Date picker, default = 1 year ago (today minus 365 days).
- Preview line: "This will permanently delete N records older than YYYY-MM-DD." N is fetched by an initial `GET /audit?to=<date>&page_size=1` to read `total`.
- Two buttons: Cancel / "Yes, permanently delete N records".
- On confirm, calls `DELETE /audit?before=YYYY-MM-DD`.
- On success: toast "Deleted N records." The list reloads.

Clean is invisible (not just disabled) for admins — only owner sees the button at all.

---

## 6. Permissions Summary

| Capability | Owner | Admin | Member |
|---|---|---|---|
| Read audit log (`GET /audit`) | ✅ | ✅ | ❌ (403) |
| Export audit log CSV | ✅ | ✅ | ❌ |
| Delete audit log (`DELETE /audit`) | ✅ | ❌ (403) | ❌ |
| See Clean button in UI | ✅ | hidden | hidden |

Members hitting `/audit` from a crafted request get a 403 from `requireRole('owner', 'admin')`. Admins hitting `DELETE /audit` get a 403 from `requireRole('owner')`.

---

## 7. Testing

`tests/audit.test.js` — unit tests for `lib/audit.js`:
- `log()` calls Supabase with the right shape (mock the supabase client).
- `log()` swallows errors and returns without throwing.
- IP extraction prefers `x-forwarded-for` first value, falls back to `req.socket.remoteAddress`, falls back to undefined.
- Actor extraction prefers explicit `opts.actor` over `req.user`.

Route-level integration tests for `/audit` are out of scope (same as Milestone A — no test DB).

---

## 8. File Layout After Milestone B

```
Attendance/
├── lib/
│   ├── auth.js
│   ├── audit.js                ← NEW: log() + ACTIONS constants
│   ├── supabase.js
│   ├── discord.js
│   └── rules.js
├── middleware/                  ← unchanged
├── routes/
│   ├── auth.js                  ← + audit.log calls
│   ├── users.js                 ← + audit.log calls
│   ├── audit.js                 ← NEW: GET + DELETE
│   ├── attendance.js            ← unchanged
│   ├── memberData.js            ← unchanged
│   ├── dashboard.js             ← unchanged
│   ├── approve.js               ← + audit.log calls
│   └── checkRole.js             ← DELETED
├── scripts/
│   ├── create-owner.js
│   └── migrate-users-data.js
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_drop_credential_check.sql
│   ├── 003_drop_legacy_tables.sql       ← NEW
│   ├── 004_readd_credential_check.sql   ← NEW
│   └── 005_create_audit_log.sql         ← NEW
├── tests/
│   ├── rules.test.js
│   ├── auth.test.js
│   ├── middleware.test.js
│   └── audit.test.js                    ← NEW
├── admin.html                   ← + Audit Log tab, Export/Clean buttons
├── server.js                    ← mount /audit; remove /webhook/check-role
├── index.html                   ← unchanged
├── member.html                  ← unchanged
└── dashboard.html               ← unchanged
```

---

## 9. Cutover Procedure (manual steps for the operator)

1. Run `migrations/005_create_audit_log.sql` in Supabase SQL Editor.
2. Restart `node server.js`. Verify it boots without errors.
3. In the browser: log in, do a couple of actions (promote/demote, approve something). Open the new Audit Log tab — rows should appear.
4. When you're satisfied the audit log captures what it should:
   - Run `migrations/003_drop_legacy_tables.sql` (drops `managers` + `members`).
   - Run `migrations/004_readd_credential_check.sql` (re-adds the smarter check constraint).

Step 4 is intentionally last: if anything goes sideways in steps 1–3 you still have the legacy data and the loose constraint to fall back on.

---

## 10. Out of Scope (Deferred)

- Tracking *read* access (who looked at what) — only mutations are logged.
- Real `trust proxy` configuration for Express (we read `x-forwarded-for` naively).
- Audit retention policy / auto-purge cron.
- Audit log row diffing — we record actor + action, not full before/after diffs (would multiply storage).
- Filtering audit log by IP or user agent in the UI.
- Email/Discord notification on suspicious patterns (many `login_failed` in a row).
- Audit log streaming to external SIEM (Datadog, etc.).
