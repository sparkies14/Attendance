# Phase 9A — Backend Reporting APIs Design

**Goal:** Add a `routes/reports.js` file with reporting endpoints that power the future /insights dashboard. Backend only — no frontend changes.

**Policy rules confirmed with owner:**
- All reporting routes are admin/owner only
- Date range is configurable via `?from=YYYY-MM-DD&to=YYYY-MM-DD`; defaults to current month (1st to today) if omitted
- Deduction reporting is a placeholder (Phase 6 not yet built)
- "Who needs attention" triggers: 2+ tardies in current month OR active (non-voided) discipline warning
- Separate CSV and PDF exports per data type (tardy, leave, discipline)
- Google Sheets push deferred to a later phase

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `lib/reportData.js` | Shared data-fetching functions used by both JSON routes and export routes |
| `routes/reports.js` | All reporting endpoints, mounted at `/reports` in `server.js` |

### Why `lib/reportData.js`

The JSON routes and the export routes need identical data. Without a shared module, the DB queries would be duplicated across 6+ handlers. `reportData.js` exposes four async functions — `fetchTardyData`, `fetchLeaveData`, `fetchDisciplineData`, `fetchAttentionData` — each returning plain JS objects that routes can serialize as JSON or format as CSV/PDF.

### Date range handling

```js
function parseDateRange(query) {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().slice(0, 10);
  const from = query.from || firstOfMonth;
  const to   = query.to   || today;
  return { from, to };
}
```

Both `from` and `to` must match `YYYY-MM-DD`. If either is malformed, the route returns 400.

---

## Routes

All routes: `requireAuth` + `requireRole('owner', 'admin')`.  
Mounted at `/reports` in `server.js`.

### `GET /reports/tardy`

Per-member tardy counts within the date range, plus a country-level rollup.

Fetches:
- `users` — active, non-owner members with `country`
- `holidays` — by country (for holiday-aware counting)
- `attendance` — rows where `date >= from AND date <= to`

Response (200):
```json
{
  "from": "2026-05-01",
  "to": "2026-05-27",
  "members": [
    {
      "name": "Ana Reyes",
      "email": "ana@company.com",
      "country": "PH",
      "minor": 2,
      "major": 0,
      "awolHalf": 0,
      "awolFull": 0,
      "total": 2
    }
  ],
  "byCountry": [
    { "country": "PH", "minor": 5, "major": 1, "awolHalf": 0, "awolFull": 0 }
  ]
}
```

### `GET /reports/leave`

Per-member leave utilization. `usedInRange` counts approved leave records whose `start_date` falls within `from`–`to`. Overall `used`, `entitled`, and `remaining` are always full-year totals (leave balance is annual, not date-range scoped).

Fetches:
- `users` — active, non-owner members with `created_at` (for hire year)
- `leave_log` — all approved records (for full-year balance) + records in range (for `usedInRange`)
- `leave_adjustments` — all records for the member

> **Note for implementer:** The date column on `leave_log` used to filter `usedInRange` must be confirmed against the actual schema during implementation. Use `created_at` as fallback if no explicit `start_date` column exists.

Response (200):
```json
{
  "from": "2026-05-01",
  "to": "2026-05-27",
  "members": [
    {
      "name": "Ana Reyes",
      "email": "ana@company.com",
      "entitled": 15,
      "used": 3,
      "remaining": 12,
      "usedInRange": 1
    }
  ]
}
```

### `GET /reports/discipline`

Per-member warning counts. `issuedInRange` counts records whose `issued_at` falls within `from`–`to`.

Fetches:
- `users` — active, non-owner members
- `discipline_records` — all records (voided + active)

Response (200):
```json
{
  "from": "2026-05-01",
  "to": "2026-05-27",
  "members": [
    {
      "name": "Ana Reyes",
      "email": "ana@company.com",
      "total": 2,
      "active": 1,
      "voided": 1,
      "issuedInRange": 1
    }
  ]
}
```

### `GET /reports/attention`

"Who needs attention" — always scoped to current month regardless of query params (date range params ignored). A member appears if they meet one or both triggers.

Triggers:
- **2+ tardies this month** — minor + major + awolHalf + awolFull >= 2 in current calendar month
- **Active warning** — has at least one `discipline_records` row where `voided = false`

Fetches:
- `users` — active, non-owner members
- `attendance` — current month rows
- `discipline_records` — all rows (voided filter applied in memory)

Response (200):
```json
{
  "members": [
    {
      "name": "Ana Reyes",
      "email": "ana@company.com",
      "reasons": ["2+ tardies this month", "Active warning"]
    }
  ]
}
```

Returns `{ "members": [] }` if no one needs attention.

### `GET /reports/deductions`

Placeholder. Returns immediately without any DB queries.

Response (200):
```json
{
  "message": "Deduction reporting available after Phase 6.",
  "data": []
}
```

### `GET /reports/export/tardy.csv`
### `GET /reports/export/leave.csv`
### `GET /reports/export/discipline.csv`

Same `?from=&to=` params. Calls the corresponding `fetchXxxData()` function from `lib/reportData.js` and serializes to CSV. Response headers:

```
Content-Type: text/csv
Content-Disposition: attachment; filename="tardy-2026-05-01-to-2026-05-27.csv"
```

CSV column order:

**tardy:** `Name, Email, Country, Minor, Major, AWOL Half, AWOL Full, Total`

**leave:** `Name, Email, Entitled, Used, Remaining, Used In Range`

**discipline:** `Name, Email, Total Warnings, Active, Voided, Issued In Range`

No external CSV library needed — values are comma-joined strings with header row. Commas and quotes in values are escaped (wrap in double-quotes, escape inner double-quotes as `""`).

### `GET /reports/export/tardy.pdf`
### `GET /reports/export/leave.pdf`
### `GET /reports/export/discipline.pdf`

Same `?from=&to=` params. Uses `pdfkit` (new dependency). Generates a simple table:
- Title: e.g. `Tardy Report`
- Subtitle: `2026-05-01 to 2026-05-27`
- Column headers + one row per member
- No charts (charts are frontend-only)

Response headers:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="tardy-2026-05-01-to-2026-05-27.pdf"
```

---

## `lib/reportData.js` — Exported functions

```js
fetchTardyData(from, to)         // → { from, to, members, byCountry }
fetchLeaveData(from, to)         // → { from, to, members }
fetchDisciplineData(from, to)    // → { from, to, members }
fetchAttentionData()             // → { members }
```

Each function is async and returns a plain object. Routes call these and either `res.json()` the result or pass it to a CSV/PDF serializer.

---

## `server.js` change

```js
app.use('/reports', require('./routes/reports'));
```

Added after `/appeals`.

---

## Testing

Same Jest + supertest + Supabase mock pattern (`c(data, error)` chain mock) as `routes/discipline.js` and `routes/appeals.js`.

`lib/reportData.js` functions are tested indirectly through the route tests — no separate unit tests for the data functions (the route tests exercise the same DB call paths).

Key test cases per route:

| Route | Tests |
|-------|-------|
| `GET /reports/tardy` | 403 member, 400 bad date, 200 with counts, 200 byCountry rollup, 500 DB error |
| `GET /reports/leave` | 403 member, 400 bad date, 200 with balance fields, 500 DB error |
| `GET /reports/discipline` | 403 member, 400 bad date, 200 with counts, 500 DB error |
| `GET /reports/attention` | 403 member, 200 triggers both reasons, 200 single reason, 200 empty list |
| `GET /reports/deductions` | 403 member, 200 placeholder shape |
| CSV exports | 403 member, 400 bad date, 200 correct headers + body shape |
| PDF exports | 403 member, 400 bad date, 200 correct Content-Type header |

---

## What is NOT in scope

- Deduction data (Phase 6 dependency)
- Google Sheets push (deferred)
- Frontend dashboard, charts, or any HTML changes
- Real-time / websocket updates
- Email-scheduled reports
