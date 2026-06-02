# Late Manual-Clock-In Toggle — Design

**Date:** 2026-06-02
**Status:** Approved (design), pending spec review

## Problem

When a member clocks in after 9:10 JST, the member page forces them into **manual** entry mode: they must type a reason, and the entry is saved as `Pending` until an owner/admin approves it before their timer starts. The admin wants to **temporarily turn this requirement off** — letting late members clock in instantly — without losing tardiness tracking.

Current mechanics (confirmed in code):
- `frontend/components/member/pages/HomePage.tsx:153-155`: `const late = hour > 9 || (hour === 9 && minute > 10); setEntryType(late ? 'manual' : 'auto');`
- `HomePage.tsx:409`: shows a "Past 9:10 — manual entry required" badge when late.
- The 9:10 manual gate is a **frontend decision only**. `routes/attendance.js` accepts an `auto` clock-in at any time and records the tardy `late_status` (via `classifyLateStatus` in `lib/rules.js`) regardless. A manual first clock-in is what gets `status: 'Pending'`.
- Admin policy settings live in the `policy_config` key/value table (`migrations/008`), edited on the **Settings → Policy config** page (`PolicyPage.tsx`) via `routes/adminPolicyConfig.js`. Threshold PATCH is currently **owner-only**.

## Goals

- An admin-flippable on/off toggle controlling the post-9:10 manual-approval requirement.
- **Off behavior:** late members clock in automatically (instant, approved), **but are still marked tardy** (`late_status` unchanged). Only the manual-approval friction is removed.
- **Editable by owner AND admin.** The existing numeric thresholds stay **owner-only**.
- Default `on` so behavior is unchanged until the flag is flipped.

Non-goals: changing the 9:10 threshold value itself; changing tardy classification; pausing tardiness tracking.

## Approach

Reuse the existing `policy_config` table — add one row `late_manual_required` (`'on'` | `'off'`). The member page reads the flag (surfaced through the member-data response it already fetches) and forces manual mode only when `late && lateManualRequired`. The Policy config page gains a toggle switch.

Rejected: a dedicated `feature_flags` table + endpoint (over-engineered for one flag); an env var (not runtime-toggleable by an admin).

## Components & Data Flow

**1. Data — `migrations/022_add_late_manual_policy.sql`**
```sql
insert into policy_config (key, value) values ('late_manual_required', 'on')
on conflict (key) do nothing;
```

**2. Backend — `routes/adminPolicyConfig.js`**
- `GET /`: in addition to the integer thresholds, return `late_manual_required` as a boolean (e.g. `config.lateManualRequired = row.value === 'on'`). The existing threshold keys remain integers.
- Writes: the toggle key `late_manual_required` is writable by **owner + admin**; the four threshold keys remain **owner-only**. Implementation: relax the write path to `requireRole('owner','admin')` and add a per-key guard — if a non-owner attempts to set any threshold key, return `403`. Toggle value must be `'on'` or `'off'`.

**3. Backend — `routes/memberData.js`**
- Read `late_manual_required` from `policy_config` and include `lateManualRequired: <boolean>` in the JSON response. Default to `true` if the row is missing.

**4. Member — `frontend/components/member/pages/HomePage.tsx`**
- Store the flag from member-data (default `true`).
- Change the late branch to: `setEntryType(late && lateManualRequired ? 'manual' : 'auto')`.
- Show the "Past 9:10 — manual entry required" badge only when `late && lateManualRequired`. When `late && !lateManualRequired`, show a softer "Running late — clocking in now" note (member is still recorded tardy server-side).

**5. Admin UI — `frontend/components/admin/pages/PolicyPage.tsx`**
- A labeled on/off switch: "Require manual approval for late (post-9:10) clock-ins", editable by owner AND admin (unlike the thresholds, which stay owner-editable only).
- Helper line: "Off — late members clock in automatically but are still marked tardy."
- On change, PATCH `late_manual_required` to `'on'`/`'off'` and reflect the returned config.

## Error Handling

- `GET` missing flag row → treat as `on` (default). Member-data missing flag → `true`.
- PATCH with invalid toggle value (not `on`/`off`) → `400`.
- PATCH of a threshold key by a non-owner → `403` (existing owner-only behavior preserved).

## Testing

- **Backend (`tests/policyConfig.test.js` + `tests/memberData.test.js`):**
  - `GET` returns `late_manual_required` as a boolean plus the thresholds.
  - Admin can PATCH `late_manual_required`; admin PATCHing a threshold key → `403`.
  - Owner can PATCH both the toggle and thresholds.
  - Invalid toggle value → `400`.
  - member-data response includes `lateManualRequired` (true when `'on'`, false when `'off'`, true when missing).
- **Frontend:** `tsc --noEmit` clean; visual check that the switch renders and toggling it changes the member late-state (badge vs auto clock-in).

## Verification Before Completion

- Full backend suite green; `tsc --noEmit` clean.
- Manual: with flag `off`, a post-9:10 clock-in is instant/approved and still shows a tardy status; with flag `on`, the manual-reason gate returns.
- Note: requires `migrations/022` to be run in Supabase for the flag row to exist (member-data/GET default to "on" until then, preserving current behavior).

## Open Detail

The exact value encoding (`'on'`/`'off'` strings) is chosen for readability in the key/value table; the API surfaces it as a boolean (`lateManualRequired`). Confirm `tests/policyConfig.test.js`'s existing mock style during implementation and follow it.
