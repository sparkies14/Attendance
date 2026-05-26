# Milestone C — Attendance Policy Engine

**Date:** 2026-05-27
**Status:** Approved
**Scope:** Automated end-of-day AWOL detection, rolling 30-working-day tardy counter with per-country holiday support, owner-configurable thresholds, Tardy Report tab in admin UI, and member self-view of their own tardiness record.

---

## 1. Overview

Milestones A and B established a unified user hierarchy and a full audit trail. Milestone C adds the enforcement layer: automatic detection of members who never clock in (AWOL), rolling tardy counts scoped to each member's country's working calendar, and visual threshold badges that surface policy violations without requiring manual counting.

The system favours simplicity and correctness over pre-computation. All tardy counts are computed on request from existing `attendance` rows — no materialized cache or summary table. At the expected team size (<100 members) this is fast enough.

---

## 2. Data Model

### 2.1 Add `country` to `users`

```sql
alter table users add column country text default 'PH';
```

ISO 3166-1 alpha-2 country code (e.g., `'PH'`, `'VN'`, `'JP'`). Defaults to `'PH'` for existing rows. If null, the tardy counter excludes weekends only (no holiday adjustment).

---

### 2.2 New table — `holidays`

```sql
create table holidays (
  id      uuid primary key default gen_random_uuid(),
  date    date not null,
  name    text not null,
  country text not null
);
create unique index holidays_date_country on holidays(date, country);
```

One row per public holiday per country. Owner manages rows in the admin UI. Members see their country's holidays as non-working days in the tardy window; admins see all countries.

---

### 2.3 New table — `policy_config`

```sql
create table policy_config (
  key    text primary key,
  value  text not null
);
```

Seeded with four rows:

| key | default value |
|---|---|
| `threshold_minor_tardy` | `3` |
| `threshold_major_tardy` | `2` |
| `threshold_awol_half` | `1` |
| `threshold_awol_full` | `1` |

Owner edits these in the admin UI. Values are read fresh on each request — no restart needed.

---

## 3. AWOL Cron + Manual Trigger

### 3.1 `lib/cron.js`

Registers the scheduled job when imported by `server.js`:

```js
cron.schedule('0 18 * * 1-5', runAwolCheck, { timezone: 'Asia/Tokyo' });
```

Runs Monday–Friday at 18:00 JST. `node-cron` handles timezone/DST automatically.

### 3.2 `runAwolCheck(date = today)` logic

1. Fetch all `users` where `role = 'member'` and `status = 'Active'`
2. For each member, query `attendance` where `email = member.email AND date = date`
3. If **no row exists** → insert:

```json
{
  "email": "...",
  "name": "...",
  "date": "...",
  "status": "Approved",
  "late_status": "AWOL FULL DAY",
  "entry_type": "auto",
  "role": "..."
}
```

4. Console-log the result: `AWOL check 2026-05-27: 3 inserted, 12 skipped`

Members who already have any attendance row for the day (including pending manual entries or any `late_status`) are skipped — a row's existence means they showed up or already have a pending record.

### 3.3 Manual trigger — `POST /admin/run-awol-check`

Owner + admin only. Optional body `{ "date": "YYYY-MM-DD" }` — defaults to today. Runs the same `runAwolCheck(date)` function. Returns:

```json
{ "inserted": 3, "skipped": 12, "date": "2026-05-27" }
```

Covers the edge case where the server was down at 18:00. Idempotent — calling it twice for the same date inserts 0 records the second time because members already have a row for that date.

---

## 4. Tardy Counting Logic

### 4.1 `lib/tardyCounter.js`

Pure function — no DB calls, fully testable:

```js
function countTardiness(attendanceRows, holidays, windowDays = 30)
// returns { minor, major, awolHalf, awolFull, workingDaysInWindow }
```

**Working day window calculation:**
1. Start from today, walk backwards day by day
2. A day counts as a working day if: not Saturday/Sunday AND date not found in `holidays` (filtered by the member's `country`)
3. Stop once `windowDays` working days have been counted — that start date bounds the window

**Counting:** scan `attendanceRows` where `date` falls within the window, tally by `late_status`:

| `late_status` value | Counter |
|---|---|
| `'MINOR TARDY'` | `minor` |
| `'MAJOR TARDY'` | `major` |
| `'AWOL HALF DAY'` | `awolHalf` |
| `'AWOL FULL DAY'` | `awolFull` |

### 4.2 `lib/policyConfig.js`

```js
async function getThresholds()
// reads all rows from policy_config, returns { minor, major, awolHalf, awolFull }

function isOverThreshold(counts, thresholds)
// returns { exceeded: boolean, reasons: string[] }
// e.g. reasons: ['3 minor tardies (limit: 3)', '1 AWOL half day (limit: 1)']
```

`getThresholds()` performs one Supabase read per call. At the team's scale (≤100 members, one read per Tardy Report page load) this is fast enough without caching.

---

## 5. API Routes

### 5.1 Tardy report

**`GET /admin/tardy-report`** — owner + admin only.

Fetches all active members, their attendance history (last 30+ working days worth of rows), all holidays grouped by country, and current thresholds. Runs `countTardiness` + `isOverThreshold` per member server-side. Returns:

```json
{
  "thresholds": { "minor": 3, "major": 2, "awolHalf": 1, "awolFull": 1 },
  "members": [
    {
      "id": "...", "name": "Ana Reyes", "email": "...", "country": "PH",
      "counts": { "minor": 2, "major": 0, "awolHalf": 0, "awolFull": 0 },
      "exceeded": false, "reasons": []
    }
  ]
}
```

**`GET /member/tardy-summary`** — any authenticated user.

Returns the caller's own tardy counts only (same shape as a single `members[]` entry). Admin/owner can call this for their own record; they use `/admin/tardy-report` for others.

### 5.2 Manual AWOL trigger

**`POST /admin/run-awol-check`** — owner + admin only. Body: `{ "date": "YYYY-MM-DD" }` (optional, defaults to today). Returns `{ inserted, skipped, date }`.

### 5.3 Holidays CRUD — owner only

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/holidays` | List all holidays; optional `?country=PH` filter |
| `POST` | `/admin/holidays` | Add `{ date, name, country }` |
| `DELETE` | `/admin/holidays/:id` | Remove a holiday |

### 5.4 Policy config — owner only

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/policy-config` | Return all threshold key-value pairs |
| `PATCH` | `/admin/policy-config` | Update one or more `{ key: value }` pairs |

Validation: values must parse as positive integers ≥ 1.

### 5.5 Country field — extend existing user update

`PATCH /users/:id` gains `country` as an updatable field. Owner/admin can set it for any user; members can set it only for themselves (existing `requireSelfOrRole` middleware handles this).

---

## 6. UI Changes

### 6.1 `admin.html` — three new tabs

Current strip: `[ Users ]  [ Audit Log ]`

New strip: `[ Users ]  [ Audit Log ]  [ Tardy Report ]  [ Holidays ]  [ Policy Config ]`

Tab switching is local state (no URL routing), matching the existing Audit Log pattern.

---

**Tardy Report tab:**

```
Tardy Report  (last 30 working days)
[ ↻ Refresh ]   Last updated: 2 min ago
────────────────────────────────────────────────────────────
Name          Country   Minor   Major   AWOL½   AWOL★   Status
────────────────────────────────────────────────────────────
Ana Reyes     PH          2       0       0       0     ✅ OK
Marco Tran    VN          3       1       0       0     ⚠️ Exceeded
                                                   (3 minor, 1 major)
```

- Exceeded rows have an amber background
- "Exceeded" tooltip/inline note shows which thresholds were crossed and the limits
- Table is sorted: exceeded rows first, then alphabetical by name

---

**Holidays tab:**

```
Holidays
[ Country ▾ All ]   [ + Add Holiday ]

Date            Name                      Country   Actions
2026-01-01      New Year's Day            PH        [ Delete ]
2026-04-09      Araw ng Kagitingan        PH        [ Delete ]
2026-04-30      Reunification Day         VN        [ Delete ]
```

"Add Holiday" opens a modal: date picker, name text field, country dropdown (PH / VN / JP / Other). "Delete" requires confirmation ("Delete this holiday?").

---

**Policy Config tab:**

```
Policy Config
(Owner only — admins see this as read-only)

Threshold — Minor Tardy     [ 3 ] occurrences in 30 working days
Threshold — Major Tardy     [ 2 ]
Threshold — AWOL Half Day   [ 1 ]
Threshold — AWOL Full Day   [ 1 ]

[ Save ]
```

Admins see the current values but all inputs are disabled and "Save" is hidden.

---

### 6.2 `member.html` — tardy summary card

New card added below the existing calendar section:

```
Your Attendance  (last 30 working days)
────────────────────────────────────────
Minor Tardy         2
Major Tardy         0
AWOL Half Day       0
AWOL Full Day       0
Status              ✅ On Track
────────────────────────────────────────
Country:  🇵🇭 Philippines   [ Change ]
```

"Change" replaces the country label with a dropdown + "Save" / "Cancel". Save calls `PATCH /users/:id` with `{ country }`.

Status is `✅ On Track` if no threshold is exceeded; `⚠️ Policy Warning` with a short reason line if exceeded.

---

## 7. Permissions Summary

| Capability | Owner | Admin | Member |
|---|---|---|---|
| GET /admin/tardy-report | ✅ | ✅ | ❌ 403 |
| GET /member/tardy-summary | ✅ (own) | ✅ (own) | ✅ (own) |
| POST /admin/run-awol-check | ✅ | ✅ | ❌ 403 |
| GET /admin/holidays | ✅ | ✅ | ❌ 403 |
| POST/DELETE /admin/holidays | ✅ | ❌ 403 | ❌ 403 |
| GET /admin/policy-config | ✅ | ✅ (read-only UI) | ❌ 403 |
| PATCH /admin/policy-config | ✅ | ❌ 403 | ❌ 403 |
| PATCH /users/:id (country) | ✅ any | ✅ any | ✅ own only |

---

## 8. Testing

**`tests/tardyCounter.test.js`:**
- 30-working-day window correctly skips weekends
- 30-working-day window correctly skips country holidays
- Counts map correctly to each `late_status` value
- Member with no attendance rows → all zeros
- `isOverThreshold` fires correctly for each threshold category
- `isOverThreshold` includes all crossed thresholds in `reasons`, not just the first

**`tests/cron.test.js`:**
- `runAwolCheck` inserts a record for a member with no clock-in for the day
- `runAwolCheck` skips a member who already has any attendance record for the day
- `runAwolCheck` skips inactive users and non-member roles
- Inserted record has `late_status = 'AWOL FULL DAY'` and `status = 'Approved'`

---

## 9. File Layout After Milestone C

```
Attendance/
├── lib/
│   ├── auth.js
│   ├── audit.js
│   ├── discord.js
│   ├── rules.js
│   ├── supabase.js
│   ├── cron.js                    ← NEW: node-cron job + runAwolCheck()
│   ├── tardyCounter.js            ← NEW: countTardiness(), isOverThreshold()
│   └── policyConfig.js            ← NEW: getThresholds()
├── middleware/                    ← unchanged
├── routes/
│   ├── auth.js
│   ├── users.js                   ← + PATCH country field
│   ├── audit.js
│   ├── attendance.js
│   ├── memberData.js
│   ├── dashboard.js
│   ├── approve.js
│   ├── adminTardy.js              ← NEW: GET /admin/tardy-report, POST /admin/run-awol-check
│   ├── adminHolidays.js           ← NEW: CRUD /admin/holidays
│   └── adminPolicyConfig.js       ← NEW: GET/PATCH /admin/policy-config
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_drop_credential_check.sql
│   ├── 003_drop_legacy_tables.sql
│   ├── 004_readd_credential_check.sql
│   ├── 005_create_audit_log.sql
│   ├── 006_add_country_to_users.sql     ← NEW
│   ├── 007_create_holidays.sql          ← NEW
│   └── 008_create_policy_config.sql     ← NEW (+ seed insert)
├── tests/
│   ├── rules.test.js
│   ├── auth.test.js
│   ├── middleware.test.js
│   ├── audit.test.js
│   ├── tardyCounter.test.js       ← NEW
│   └── cron.test.js               ← NEW
├── admin.html                     ← + Tardy Report, Holidays, Policy Config tabs
├── member.html                    ← + tardy summary card + country picker
├── server.js                      ← + import lib/cron.js, mount new routes
├── index.html                     ← unchanged
├── dashboard.html                 ← unchanged
└── package.json                   ← + node-cron
```

---

## 10. Dependencies

```json
"node-cron": "^3.0.3"
```

No other new dependencies. `node-cron` v3 supports timezone natively via the `timezone` option.

---

## 11. Cutover Procedure

1. Run `migrations/006_add_country_to_users.sql` in Supabase SQL Editor
2. Run `migrations/007_create_holidays.sql`
3. Run `migrations/008_create_policy_config.sql` (seeds the four threshold rows)
4. `npm install` (adds `node-cron`)
5. Restart `node server.js` — cron registers at startup; verify log line: `AWOL cron registered: 18:00 JST weekdays`
6. In admin UI: open the Holidays tab and add your team's national holidays
7. Open Policy Config tab and confirm/adjust thresholds
8. Open Tardy Report tab — all members should show counts (zeros if no tardiness in window)

---

## 12. Out of Scope (Deferred to Milestone D and beyond)

- Salary deduction calculation (depends on tardy data now available — Milestone D)
- Leave accrual/balance tracking (Milestone D)
- Progressive discipline records / formal written warnings (Milestone D)
- Paid-leave calendar UI for members (Milestone D)
- Rate limiting on auth routes, account lockout, email password reset (Milestone E — Security Hardening)
- Audit log retention auto-purge cron (Milestone E)
- Tardy trend graphs / charts in admin UI
- Discord notification when a member crosses a threshold
- Filtering Tardy Report by country or threshold status
