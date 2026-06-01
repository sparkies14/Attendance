# Official + Manual Holidays — Admin & Member Calendar

**Date:** 2026-06-01
**Status:** Approved (design)

## Problem

The admin Holidays page only supports manually typed holidays (and currently
shows mock data — the `holidays` table is empty). Admins want **official public
holidays auto-imported per country**, while keeping manual entry for
company-specific or locally observed days the internet source doesn't have.
Members should see their country's holidays on their Calendar tab (today it
shows none).

## Supported countries

A fixed set of 7, stored as ISO-3166-1 alpha-2 codes (matching `users.country`),
with display names shared between backend and admin UI:

| Code | Name |
|------|------|
| PH | Philippines |
| JP | Japan |
| TH | Thailand |
| MM | Myanmar |
| IN | India |
| BD | Bangladesh |
| MY | Malaysia |

Rationale: Calendarific covers all 7; the free keyless alternative (Nager.Date)
only covers PH/JP/BD, which is why Calendarific was chosen.

## Data source

**Calendarific** (https://calendarific.com), free tier (1000 req/month — usage
is ~7 countries × a few years ≈ tens of requests/year). API key stored as the
env var `CALENDARIFIC_API_KEY` on Render. Endpoint:
`https://calendarific.com/api/v2/holidays?api_key=KEY&country=XX&year=YYYY`.
Response holidays are filtered to **national/public** holidays (entries whose
`type` includes "National holiday"); observances/seasons are skipped.

## Data model

`holidays` table already exists: `id uuid pk, date date, name text, country
text`, unique index on `(date, country)`. Add one column:

```sql
alter table holidays add column if not exists source text not null default 'manual';
```

- `source = 'manual'` — typed by an admin (existing behavior; default).
- `source = 'auto'` — imported from Calendarific.

This separation lets re-sync refresh auto data without ever touching manual
entries.

## Architecture

### Pre-existing bug to fix (prerequisite)

`routes/adminHolidays.js` is mounted at `/admin` (shared with `adminTardy` and
`adminPolicyConfig`) but defines its routes at bare `/` and `/:id`. The frontend
calls `/admin/holidays`, `/admin/holidays/:id` — which **do not match** today, so
`GET/POST /admin/holidays` 404 and the admin page silently falls back to mock
data. Sibling router `adminTardy` correctly prefixes its paths
(`/tardy-report`, …).

**Fix as part of this work:** change `adminHolidays.js` route paths to be
prefixed so they match the mount + frontend:

- `GET    /holidays`        (was `/`)
- `POST   /holidays`        (was `/`)
- `DELETE /holidays/:id`    (was `/:id`)
- `POST   /holidays/sync`   (new — see below)

No frontend URL changes are needed (it already calls `/admin/holidays*`); this
just makes the backend actually serve them.

### Backend — official import

`POST /admin/holidays/sync` — owner-only (`requireRole('owner')`), in
`routes/adminHolidays.js` (i.e. `router.post('/holidays/sync', …)`).

- Body: `{ country, year }`. Validate `country` is one of the 7 supported codes;
  `year` is a 4-digit integer within a sane range (e.g. 2000–2100). Invalid →
  `400` with a specific message.
- Read `process.env.CALENDARIFIC_API_KEY`. Missing → `400 "Holiday API key not
  configured."` (no crash).
- Fetch from Calendarific. On non-200 or `response.meta.code !== 200` →
  `502 "Holiday provider error: <message>"`.
- Normalize each kept holiday to `{ date: <YYYY-MM-DD>, name, country,
  source: 'auto' }` (take the first 10 chars of `holiday.date.iso`).
- **Re-sync (idempotent):** delete existing rows where
  `country = X AND source = 'auto' AND date >= 'YYYY-01-01' AND date <=
  'YYYY-12-31'`, then bulk-insert the normalized set. Manual rows untouched.
- Response: `{ imported: <count> }`.

### Backend — member read

`GET /holidays/mine?year=YYYY` — any authenticated user (`requireAuth`), in a new
`routes/holidays.js` mounted at `/holidays`.

- Look up the logged-in user's `country` from `users` by `req.user` (id/email).
- Return `{ country, holidays: [...] }` for that country and year, ordered by
  date. If the user has no country set → `{ country: null, holidays: [] }`.
- Members never reach the admin CRUD/sync routes.

### Frontend — Admin Holidays page (`HolidaysPage.tsx`)

- Keep existing: manual add (date/name/country), delete, country filter.
- Add a **"Sync official holidays"** panel: a country `<select>` (the 7) + a
  year input (default current year) + a **Sync** button → `POST
  /admin/holidays/sync` → on success show "Imported N holidays." and refresh the
  list. On error show the server message inline.
- Each holiday row shows a source badge: **AUTO** (gray) or **MANUAL** (blue).
- Auto and manual rows are both deletable; deleting an auto row is fine (a
  re-sync re-adds it).

### Frontend — Member Calendar tab (`CalendarPage.tsx`)

- On load (and when the visible year changes), fetch `GET /holidays/mine?year=…`.
- **Highlight holiday dates** on the calendar grid (a small dot/tint on those
  days).
- Show a compact read-only **"Holidays"** list (date · name) for the member's
  country, for the visible year.
- If the fetch fails or the member has no country, the calendar still renders
  normally with no holiday highlights (quiet degrade).

## Data flow

1. Admin opens Holidays page → picks country + year → clicks Sync.
2. `POST /admin/holidays/sync` → Calendarific fetch → delete-auto-then-insert →
   `{ imported: N }`.
3. Page refreshes the holiday list (`GET /admin/holidays`), badges show AUTO.
4. Member opens Calendar → `GET /holidays/mine?year` → holiday dates highlighted
   + listed.

## Error handling

- Missing `CALENDARIFIC_API_KEY` → `400` with a clear message; admin UI shows it.
- Unsupported country / bad year → `400`.
- Calendarific non-200 / error payload / network failure → `502` with the
  provider message; admin UI shows it; nothing crashes.
- Member holiday fetch failure or no country → calendar renders without
  highlights.

## Testing

**Backend (Jest + supertest, mock `lib/supabase` and `global.fetch`):**
- Path correction: `GET /admin/holidays` returns the list (regression guard for
  the route-prefix fix).
- `POST /admin/holidays/sync`: (a) missing API key → 400; (b) unsupported
  country → 400; (c) happy path filters to national holidays, normalizes dates,
  deletes old auto rows for the year, inserts new ones, returns
  `{ imported }`; (d) Calendarific error payload → 502; (e) non-owner → 403.
- `GET /holidays/mine`: (a) returns the logged-in user's country holidays; (b)
  user with no country → `{ country: null, holidays: [] }`; (c) unauthenticated
  → 401.

**Frontend:** verify in the running app (harness) that the admin Sync panel and
source badges render, and that the member calendar shows highlighted holiday
dates + the holidays list from mocked endpoint data.

## Out of scope (YAGNI)

- No automatic yearly cron (admin-triggered sync only; can add later).
- No editing of individual auto entries (delete + re-sync instead).
- No multi-country view for a single member (they see their own country only).
- No holiday "type" taxonomy stored (only `source`).
