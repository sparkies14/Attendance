# Phase 10B — Member Dashboard (Next.js)

**Date:** 2026-05-28
**Status:** Approved
**Depends on:** Phase 10A (Login page) — complete

---

## Overview

Phase 10B builds the full member-facing dashboard at `/member`. Members land here after login. The page has **7 tabs**, each backed by real backend endpoints. Visual style is Compact Mono — same as the login page (`#fafafa` background, white cards, monospace labels, black pill buttons).

---

## Tabs

| # | Tab | Primary endpoint(s) |
|---|-----|---------------------|
| 1 | Today | `POST /attendance` |
| 2 | Overview | `GET /member-data`, `GET /leave-balance` |
| 3 | Attendance | `GET /member-data` |
| 4 | Leave | `GET /member-data`, `GET /leave-balance`, `POST /attendance` |
| 5 | Discipline | `GET /discipline` |
| 6 | Appeals | `GET /appeals`, `POST /appeals` |
| 7 | Settings | `GET /auth/me`, `POST /auth/change-password`, `POST /auth/link-google` |

---

## Architecture

### File Map

**Modify:**
- `frontend/app/member/page.tsx` — convert from placeholder to Server Component; fetch initial data, pass to client shell

**Create:**
- `frontend/components/member/MemberDashboard.tsx` — Client Component; owns tab state, renders tab bar and active tab
- `frontend/components/member/tabs/TodayTab.tsx` — Client Component
- `frontend/components/member/tabs/OverviewTab.tsx` — Client Component
- `frontend/components/member/tabs/AttendanceTab.tsx` — Client Component
- `frontend/components/member/tabs/LeaveTab.tsx` — Client Component
- `frontend/components/member/tabs/DisciplineTab.tsx` — Client Component
- `frontend/components/member/tabs/AppealsTab.tsx` — Client Component
- `frontend/components/member/tabs/SettingsTab.tsx` — Client Component

### Data Flow

`page.tsx` (Server Component) fetches in parallel on load:
- `GET /auth/me` → user profile (name, email, hasPassword, hasGoogle)
- `GET /leave-balance?email=` → leave balance
- `GET /member-data?email=&month=&year=` → today's month calendar + summary + onLunch + onBreak + leaveHistory

Passes all fetched data as props to `<MemberDashboard>`. Each tab component receives relevant slices as props and calls the API client-side only for mutations or tab-specific loads (e.g., discipline list loaded when Discipline tab is first opened — lazy).

---

## Tab Specifications

### Tab 1 — Today

Displays the member's daily time-tracking actions. All buttons send `POST /attendance` (credentials: include). The current JST time and date are computed client-side on button click.

**Button logic (mutually exclusive states):**

| State | Buttons shown |
|-------|--------------|
| Not clocked in | **Clock In** |
| Clocked in, not clocked out | **Clock Out**, **Lunch Out** (if not onLunch), **Lunch In** (if onLunch), **Break Out** (if not onBreak), **Break In** (if onBreak) |
| Clocked out | — (show today's summary: clock-in time, clock-out time, total hours) |

**Request body for each action:**
- `clock-in`: `{ action: 'clock-in', entry_type: 'web', local_time, date, jst_hour, jst_minute }`
- `clock-out`: `{ action: 'clock-out', local_time, date }`
- `lunch-out`: `{ action: 'lunch-out', local_time, date }`
- `lunch-in`: `{ action: 'lunch-in', local_time, date }`
- `break-out`: `{ action: 'break-out', local_time, date }`
- `break-in`: `{ action: 'break-in', local_time, date }`

`local_time` format: `HH:MM` (JST). `date` format: `YYYY-MM-DD` (JST).

Initial `onLunch` and `onBreak` values come from the server-fetched `member-data` response. After each action, re-fetch `member-data` for the current month to refresh state.

On success: show the response `message` as a success banner. On error: show `data.error` as an inline error.

---

### Tab 2 — Overview

Read-only summary. Data comes from props (no additional fetch).

**Displays:**
- Member name and email (from `/auth/me`)
- This month's attendance summary: Present / Late / Absent / Pending counts (from `member-data.summary`)
- Leave balance: total days / used / remaining (from `leave-balance`)

---

### Tab 3 — Attendance

Monthly calendar view with previous/next month navigation.

**State:** `month` and `year` (default: current month). When month changes, fetch `GET /member-data?email=&month=&year=`.

**Calendar grid:** 7-column grid (Mon–Sun). Each cell shows the day number and a colour-coded status dot:
- `present` → green
- `late` → amber
- `absent` → red
- `pending` → grey
- `weekend` → dimmed, no dot

Below the grid: summary strip (present / late / absent / pending counts for the selected month).

---

### Tab 4 — Leave

**Displays:**
- Leave balance card (total / used / remaining) — from props
- Leave history table: date, leave type, reason, status badge (Pending/Approved/Rejected) — from `member-data.leaveHistory`

**Action — Submit Leave Request:**
- Button: "Request Leave" opens an inline form
- Fields: date (date picker), leave type (select: Vacation / Sick / Emergency / Other), reason (textarea)
- Submits `POST /attendance` with `{ action: 'leave', date: selectedDate, leave_type, reason }`
- On success: show success message, re-fetch member-data to refresh leave history

---

### Tab 5 — Discipline

Loaded lazily on first tab open: `GET /discipline?email=`.

**Displays:** List of discipline records. Each record shows:
- Date issued (`issued_at`)
- Reason
- Status: Active (red badge) or Voided (grey badge)
- If active and no existing appeal: "Appeal" button

**Appeal flow:** Clicking "Appeal" opens an inline form with a reason textarea. Submits `POST /appeals` with `{ target_type: 'discipline', target_id: record.id, reason }`. On success: show confirmation, disable the appeal button for that record.

---

### Tab 6 — Appeals

Loaded lazily on first tab open: `GET /appeals`.

**Displays:** List of own appeals. Each row shows:
- Type (discipline / leave / attendance)
- Target ID
- Reason
- Status badge: Pending (grey) / Approved (green) / Rejected (red)
- Resolution note (if resolved)

**Action:** "New Appeal" button opens a form:
- Fields: type (select: discipline / leave / attendance), target ID (text — UUID for discipline/leave, `YYYY-MM-DD` date for attendance), reason (textarea)
- Note: most appeals come from context buttons in Discipline and Attendance tabs; this standalone form is a fallback
- Submits `POST /appeals`

---

### Tab 7 — Settings

Data from `GET /auth/me` (passed as props).

**Change Password section:**
- Fields: Current password (hidden if `hasPassword` is false — Google-only accounts), New password, Confirm new password
- Validates new === confirm client-side
- Submits `POST /auth/change-password` with `{ current_password, new_password }`

**Link Google section:**
- If `hasGoogle` is true: show "Google account linked" badge, no button
- If `hasGoogle` is false: show "Link Google Account" button — loads GSI script (same pattern as login page), calls `POST /auth/link-google` with `{ credential }`

---

## Middleware

Tabs are client-side — there are no sub-routes under `/member`. Add the exact path to the matcher so unauthenticated users are redirected.

**Change in `frontend/middleware.ts`:**
```
matcher: ['/insights/:path*', '/help/:path*', '/member']
```

---

## Error Handling

- All API calls: on network error show "Network error. Please try again."
- All API calls: on non-ok response show `data.error`
- Loading states: show "Loading…" text while tab data is being fetched
- Empty states: explicit "No records." message per tab

---

## Environment Variables

No new env vars. Uses existing `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

---

## Testing Checklist

- Visit `/member` as a member after login → Today tab loads, shows correct button state
- Clock in → button changes to Clock Out / Lunch / Break buttons, success message shown
- Clock out → summary (in/out/hours) shown, action buttons gone
- Lunch out → Lunch In button appears; Lunch In → Lunch Out button returns
- Navigate to Overview → summary counts and leave balance visible
- Navigate to Attendance → calendar renders, month navigation works, colours correct
- Navigate to Leave → history table shown, "Request Leave" form submits successfully
- Navigate to Discipline → records listed, Appeal form submits and disables button
- Navigate to Appeals → own appeals listed, New Appeal form works
- Navigate to Settings → change password works, Link Google button shown when not linked
- Visit `/member` when not logged in → redirected to login (middleware)
