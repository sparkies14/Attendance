# Admin Attendance Dashboard — Live Status Design

**Date:** 2026-06-02
**Status:** Approved (design), pending spec review

## Problem

The admin **Attendance** dashboard has one bug and several gaps:

1. **Clocked-in members show as "Absent."** `routes/dashboard.js` queries today's
   attendance with `todayJST()`, which returns en-US `M/D/YYYY` (e.g. `6/2/2026`).
   The member clock-in (`frontend/components/member/pages/HomePage.tsx:44`) writes the
   row with `date` in ISO `YYYY-MM-DD` (e.g. `2026-06-02`). The two strings never match,
   so the attendance lookup returns nothing and every active member falls through to
   `NOT CLOCKED IN` → rendered as **Absent**. This is the same date-format trap already
   fixed for break/lunch in commit `9e6e5f0` (via `todayJSTISO()`); the dashboard route
   never received the fix.

2. **The "On lunch / break" panel is faked.** `AttendancePage.tsx:218` shows clocked-in
   members as an approximation — the dashboard route does not fetch `break_log`/`lunch_log`
   at all. There is no way to see who is currently out, or who has exceeded their budget.

3. **The "On leave" stat is a placeholder** (`AttendancePage.tsx:307` shows `—` / N/A).

4. **Emergency clock-outs** are only a small badge in the table — no at-a-glance view.

## Goals

- Fix the absent bug.
- Show everyone currently on lunch or break, with a live elapsed timer, flagging anyone
  over budget (15 min break / 60 min lunch).
- Surface a real "On leave today" count and an "over budget" alert count.
- Add an Emergency panel listing today's emergency clock-outs with reason.

Non-goals: changing how attendance/break/lunch are recorded; leave-range handling beyond
single-date approved leave (revisit later if `leave_log` turns out to store ranges).

## Approach

Extend the existing `GET /dashboard` route rather than adding a new endpoint. It already
joins `attendance` against active members in one pass; we add today's `break_log`,
`lunch_log`, and approved `leave_log` to the same `Promise.all`, then enrich each member
object and the `summary`. One round trip; reuses the aggregation logic already proven in
`routes/memberData.js:103-114`.

Rejected alternatives: a separate `/dashboard/live` endpoint (extra request + duplicated
member-join logic), and per-member frontend fetches (N requests).

## Backend — `routes/dashboard.js`

- **Date fix:** replace `todayJST()` with `todayJSTISO()` for the attendance query so the
  `date` filter matches stored ISO rows.
- Add to `Promise.all`:
  - `break_log` where `date = todayJSTISO()` (keyed by member `name`).
  - `lunch_log` where `date = todayJSTISO()` (keyed by member `name`).
  - `leave_log` where `status = 'Approved'` and `date = todayJSTISO()` (keyed by `email`).
- Per-member aggregation (mirror `memberData.js`):
  - `onBreak` = an open break row exists (`break_in` empty); `breakStart` = its `break_out`.
  - `breakUsedSecs` = sum of `duration_secs` over completed break rows.
  - `onLunch` / `lunchStart` / `lunchUsedSecs` = same for lunch.
  - `onLeave` (bool) + `leaveType` matched from approved leave by email.
- Extend `summary` with counts: `onBreak`, `onLunch`, `overBudget`, `onLeave`, `emergency`.
  `overBudget` = members whose `breakUsedSecs > breakBudget` OR `lunchUsedSecs > lunchBudget`
  at fetch time (the live timer refines this client-side for in-progress sessions).
- Add `budgets: { breakSecs: 900, lunchSecs: 3600 }` to the payload (sourced from
  `BREAK_BUDGET_SECS` / `LUNCH_BUDGET_SECS` in `lib/rules.js`) so the frontend does not
  hardcode thresholds.

`emergency` / `emergencyReason` already exist on the member objects.

## Frontend — `AttendancePage.tsx` (+ types in `AdminDashboard.tsx`)

- **Stat row** → 5 cards: Present · Late · **On leave** (real count, names in sub) ·
  **Over budget** (new, alert-tinted when > 0) · Absent. Grid `repeat(5, 1fr)`.
- **"On lunch / break" panel** (replaces the faked one): lists everyone currently out.
  New `OutChip` component owns a 1s `setInterval` computing elapsed from `breakStart` /
  `lunchStart` against current JST time; renders `on break 12:30`, and a red **OVER**
  badge when `usedSecs + elapsed` exceeds the relevant budget. Empty state when nobody is out.
- **"Emergency" panel** (new): filters members where `emergency === true`; shows name +
  reason. Rendered only when count > 0.
- Existing **"Clocked in / active"** and **"Not clocked in yet"** panels are retained.
- Update the `DashboardData` / member types in `AdminDashboard.tsx` to include the new fields.

### Live timer detail

`breakStart` / `lunchStart` are `HH:MM:SS` strings in JST. `OutChip` parses them to
seconds-of-day, computes `elapsed = max(0, nowSecsJST - startSecs)`, displays `MM:SS`,
and flags over when `usedSecs + elapsed > budget`. Interval cleared on unmount.

## Testing

- **Backend (TDD, write first):**
  - Regression guard: attendance stored with ISO date IS matched by the route (the bug).
  - Break/lunch aggregation: `onBreak`/`onLunch`, `breakUsedSecs`/`lunchUsedSecs`,
    `overBudget` flag.
  - On-leave matching by email + approved status + today.
  - New `summary` counts and `budgets` in payload.
  - Mirrors the existing dashboard-route test style (Supabase mocked).
- **Frontend:** `tsc --noEmit` clean; visual verification of panels + ticking timer via
  the existing playwright-cli flow.

## Verification before completion

- Full backend suite green (currently 342 tests).
- `tsc --noEmit` clean.
- Manual: a member clocks in → appears Present (not Absent); goes on break → appears in
  the lunch/break panel with a ticking timer; exceeds 15 min → OVER badge + over-budget
  stat increments.

## Open detail to confirm during implementation

Whether `leave_log` stores a single date or a range, and its exact date format. Match
approved leave for today the same ISO way; confirm against a real row before finalizing.
