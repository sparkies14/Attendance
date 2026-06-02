# Member Lunch/Break Overhaul + Emergency Button

**Date:** 2026-06-02
**Status:** Approved (design)

## Problem

The current member lunch/break is a plain out→in toggle (one session each per
day, logged in `lunch_log`/`break_log`, no budget, no timer). The user wants:
budgeted, resumable break time with a live countdown; a single-use lunch with a
live countdown; soft overage handling for both; and a new **Emergency** action
(separate from Clock Out) that flags an urgent exit to admins with a reason.

## Behavior summary

| | Break | Lunch |
|---|---|---|
| Daily budget | **15:00 (900s)** | **60:00 (3600s)** |
| Sessions/day | **Multiple** (resumes from remaining budget) | **One** (consumed once you return, even with time left) |
| Timer | Live countdown while on break | Live countdown while on lunch |
| Overrun | Counts **up in red**, logged, visible to admin (soft limit — never blocks) | Same: counts **up in red**, logged |
| Interaction | Tap Break to start → "I'm back" to pause; tap again later to resume | Tap Lunch to start → "I'm back" to end (no resume) |

- Budgets reset per day (keyed by attendance `date`, JST).
- Break/lunch only available while clocked in; cannot be on break and lunch
  simultaneously.

## Emergency button

- Red **🚨 Emergency** button beside Clock Out on the member page.
- Pressing it opens a small inline prompt: **"What's the emergency?"** with a
  **dropdown of preset reasons** (fast pick when rushing) plus an **"Other"**
  choice that reveals a **free-text field**. Preset options:
  - Family emergency
  - Medical / health issue
  - Accident
  - Transportation / commute problem
  - Severe weather / disaster
  - Other… (reveals a required free-text input)
- Validation: a preset must be chosen; if "Other", the free-text is required.
  The stored `emergency_reason` is the preset label, or the typed text for
  "Other". On confirm it:
  - ends the work day exactly like Clock Out (sets `clock_out`, computes
    `total_hours`, status Approved),
  - sets `attendance.emergency = true` and stores `attendance.emergency_reason`,
  - fires a Discord alert: `🚨 EMERGENCY — <name> | <date> <time> | <reason>`.
- Admin sees a 🚨 badge + the reason on the member's attendance row.

## Data model

**Migration `020_add_duration_secs.sql`:**
```sql
alter table break_log add column if not exists duration_secs integer not null default 0;
alter table lunch_log add column if not exists duration_secs integer not null default 0;
```
- Out/in times stored as `HH:MM:SS` (seconds precision) going forward; existing
  `HH:MM` rows remain valid.
- `break_log`: multiple rows per (name, date) — one per session.
- `lunch_log`: one row per (name, date).
- `duration_secs` = in−out in seconds for completed sessions.

**Migration `021_add_emergency_to_attendance.sql`:**
```sql
alter table attendance add column if not exists emergency boolean not null default false;
alter table attendance add column if not exists emergency_reason text;
```

## Backend — `routes/attendance.js`

All times sent by client as `HH:MM:SS` (`local_time`).

- **`break-out`:** require clocked-in, not on lunch, no open break row. Insert a
  new `break_log` row `{ name, date, break_out: local_time, break_in: '',
  duration_secs: 0 }`.
- **`break-in`:** find the *open* `break_log` row (`break_in = ''`) for
  (name, date); set `break_in = local_time`, `duration_secs =
  secondsBetween(break_out, local_time)`. (If none open → 400.)
- **`lunch-out`:** require clocked-in, not on break, lunch not yet consumed
  today (no row with `lunch_in` set) and no open lunch row. Insert a
  `lunch_log` row.
- **`lunch-in`:** find the open `lunch_log` row; set `lunch_in`,
  `duration_secs`. Lunch is now consumed for the day.
- **`emergency`:** validate clocked-in and a `reason` is present (else 400).
  Behaves like `clock-out` (compute `total_hours` from accumulated + current
  segment), additionally sets `emergency = true`, `emergency_reason = reason`,
  and sends the Discord emergency alert.

`secondsBetween` parses two `HH:MM:SS` strings to seconds-of-day and subtracts
(guard against negatives → clamp to 0).

## Backend — `routes/memberData.js` (or wherever member-data is built)

**Prerequisite change:** `memberData.js` currently fetches break/lunch with
`.maybeSingle()` (assumes one row per day) at the `break_log`/`lunch_log`
queries. Since break now has **multiple** rows/day, the break query must change
to fetch all rows for (name, date) (no `maybeSingle`) and aggregate; otherwise
`maybeSingle` throws on a second break session. Lunch stays single-row but read
it the same way for consistency. `onBreak`/`breakStart` are derived from the
*open* row (the one with empty `break_in`).

Extend the member-data response with:
- `breakBudgetSecs: 900`, `breakUsedSecs` (sum of `duration_secs` for completed
  break rows today), `onBreak` (an open break row exists), `breakStart` (open
  row's `break_out`, `HH:MM:SS`, else null).
- `lunchBudgetSecs: 3600`, `lunchUsedSecs`, `onLunch`, `lunchStart`,
  `lunchConsumed` (a lunch row with `lunch_in` set exists today).
- Existing fields kept for backward compatibility.

## Timer mechanics (client)

Remaining = `budget − usedSecs − (nowJST − openStart)` where `openStart` is
`breakStart`/`lunchStart` interpreted as today's JST `HH:MM:SS`. A `setInterval`
ticks every second:
- Positive → green/normal, formatted `MM:SS left`.
- Zero or negative → red, formatted `-MM:SS over`.

Because both client and server use JST and the server is the source of truth on
each toggle (member-data refetched after each action), the countdown is accurate
across refresh and multiple devices.

## Frontend — member page (`HomePage.tsx`)

- **Break button:** label `☕ Break · MM:SS left` (remaining budget) when idle;
  while on break, live countdown + "tap to return"; over budget → red count-up.
  Tapping toggles `break-out`/`break-in`. Resumes from remaining budget.
- **Lunch button:** `🍱 Lunch` when idle; live `MM:SS left` + "I'm back" while on
  lunch; over → red count-up; once consumed → disabled `🍱 Lunch taken`.
- **Emergency button:** red `🚨 Emergency` beside Clock Out → opens inline reason
  prompt → confirm posts `emergency` action with the reason.
- The on-lunch / on-break status badges remain.

## Frontend — admin

- On the admin attendance/dashboard member row, show a 🚨 **Emergency** badge
  when `emergency` is true, with the reason on hover/detail.
- Break/lunch overage is derivable from `duration_secs` vs budget; show used vs
  budget (e.g. "Break 18:20 / 15:00", red if over) on the member's attendance
  detail so admins can spot overruns.

## Error handling

- Invalid/missing reason on emergency → 400, member sees inline message.
- break-in/lunch-in with no open row → 400 (UI shouldn't allow it, but guarded).
- Timer fetch/derivation never crashes the page; if member-data lacks the new
  fields, buttons fall back to the simple on/off labels.

## Testing

**Backend (Jest + supertest, mock supabase):**
- break-out inserts a session; break-in closes the open row and computes
  `duration_secs`; a second break-out/in accumulates a second session.
- lunch-out then lunch-in marks consumed; a second lunch-out is rejected.
- emergency without reason → 400; with reason → sets `emergency`,
  `emergency_reason`, computes `total_hours`, returns success.
- `secondsBetween` math (incl. clamp).
- member-data returns `breakUsedSecs`/`onBreak`/`breakStart` and lunch
  equivalents correctly.

**Frontend:** verify in the running app (playwright-cli now available) — break
countdown ticks and resumes; lunch counts down and disables once consumed;
over-budget shows red; emergency prompt requires a reason.

## Out of scope (YAGNI)

- No configurable budgets per member/role (fixed 15/60).
- No historical break/lunch analytics dashboard (overage is just visible on the
  day's record).
- No push/email notification for emergency beyond the existing Discord channel.
